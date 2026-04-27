import * as fs from 'fs';
import * as path from 'path';
import * as chokidar from 'chokidar';
import { HarubashiPaths } from '../common/paths';
import { latestLogFile } from '../common/logger';

// ══════════════════════════════════════════════════════════
// ── Public command ───────────────────────────────────────
// ══════════════════════════════════════════════════════════

export interface LogsOptions {
  /** Tail the file after printing (default: true). */
  follow?: boolean;
  /** Number of lines to print before tailing (default: 50). */
  lines?: number;
}

/**
 * `harubashi logs` — cross-platform `tail -f` for the daily-rotated log file.
 *
 * - Picks the most recent `harubashi-YYYY-MM-DD.log` automatically.
 * - Prints the last N lines, then (when `follow: true`) watches the logs
 *   directory and streams new content as it is appended. If a NEW log file
 *   appears (next-day rotation), it transparently switches to it.
 * - Empty / missing log dir → friendly hint, never a stack trace.
 */
export async function runLogs(opts: LogsOptions = {}): Promise<void> {
  const follow = opts.follow !== false; // default true
  const lines = opts.lines ?? 50;

  let currentFile = latestLogFile();

  if (!currentFile) {
    printEmpty();
    return;
  }

  printHeader(currentFile, follow);

  // ── Print the trailing N lines ─────────────────────────
  const trail = readLastLines(currentFile, lines);
  for (const line of trail) {
    printRendered(line);
  }

  if (!follow) return;

  // ── Watch for new content ──────────────────────────────
  let position = fs.statSync(currentFile).size;

  const watcher = chokidar.watch(HarubashiPaths.logsDir, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
  });

  watcher.on('add', (filePath) => {
    if (!isHarubashiLog(filePath)) return;
    if (currentFile && filePath > currentFile) {
      // Day rotated: a newer log file just appeared.
      console.log(
        `\x1b[90m── Rotated to ${path.basename(filePath)} ──\x1b[0m`,
      );
      currentFile = filePath;
      position = 0;
      flushNewLines(filePath, position).then((newPos) => {
        position = newPos;
      });
    }
  });

  watcher.on('change', async (filePath) => {
    if (filePath !== currentFile) return;
    position = await flushNewLines(filePath, position);
  });

  // Keep the process alive until the user hits Ctrl+C.
  process.on('SIGINT', async () => {
    await watcher.close();
    console.log('\n\x1b[90m── tail closed ──\x1b[0m');
    process.exit(0);
  });

  // Block forever (the watcher + SIGINT handler do the rest).
  await new Promise<void>(() => {
    /* never resolves — process exits via SIGINT */
  });
}

// ══════════════════════════════════════════════════════════
// ── File reading ─────────────────────────────────────────
// ══════════════════════════════════════════════════════════

function isHarubashiLog(filePath: string): boolean {
  return /harubashi-\d{4}-\d{2}-\d{2}\.log$/.test(filePath);
}

/**
 * Read the last `n` lines from the file. For our rotation policy (≤20 MB)
 * the simple read-then-slice approach is plenty fast; we don't need a
 * smart reverse-seek tail.
 */
function readLastLines(filePath: string, n: number): string[] {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const all = raw.split(/\r?\n/).filter((l) => l.length > 0);
  return all.slice(-n);
}

/**
 * Read everything appended after `fromByte`, render each new line, and
 * return the new byte position to remember for the next round.
 */
async function flushNewLines(
  filePath: string,
  fromByte: number,
): Promise<number> {
  const stat = fs.statSync(filePath);
  if (stat.size <= fromByte) return fromByte;

  const stream = fs.createReadStream(filePath, {
    start: fromByte,
    end: stat.size,
    encoding: 'utf-8',
  });

  let buffer = '';
  for await (const chunk of stream) {
    buffer += chunk;
  }

  const lines = buffer.split(/\r?\n/);
  // Last entry may be a partial line if a write was caught mid-flight; we
  // accept this — next change event will deliver the rest.
  for (const line of lines) {
    if (line.length > 0) printRendered(line);
  }

  return stat.size;
}

// ══════════════════════════════════════════════════════════
// ── Rendering ────────────────────────────────────────────
// ══════════════════════════════════════════════════════════

interface LogRecord {
  timestamp?: string;
  level?: string;
  context?: string;
  message?: string;
  ms?: string;
  stack?: string;
}

const LEVEL_COLOR: Record<string, string> = {
  error: '\x1b[31m', // red
  warn:  '\x1b[33m', // yellow
  info:  '\x1b[32m', // green
  debug: '\x1b[34m', // blue
  verbose: '\x1b[35m', // magenta
};

/** Render a single JSON-line entry as a colored, readable line. */
function printRendered(line: string): void {
  let parsed: LogRecord;
  try {
    parsed = JSON.parse(line) as LogRecord;
  } catch {
    // Not JSON — print as-is.
    console.log(line);
    return;
  }

  const ts = parsed.timestamp
    ? formatTimestamp(parsed.timestamp)
    : '????-??-?? ??:??:??';
  const lvl = (parsed.level || 'info').toLowerCase();
  const lvlColor = LEVEL_COLOR[lvl] || '\x1b[37m';
  const lvlPad = lvl.toUpperCase().padEnd(5);
  const ctx = parsed.context ? ` \x1b[36m[${parsed.context}]\x1b[0m` : '';
  const msg = parsed.message ?? '';

  console.log(
    `\x1b[90m${ts}\x1b[0m  ${lvlColor}${lvlPad}\x1b[0m${ctx}  ${msg}`,
  );

  if (parsed.stack) {
    console.log(`\x1b[31m${parsed.stack}\x1b[0m`);
  }
}

function formatTimestamp(iso: string): string {
  // "2026-04-26T14:18:00.123Z" → "2026-04-26 14:18:00"
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/.exec(iso);
  return m ? `${m[1]} ${m[2]}` : iso;
}

// ══════════════════════════════════════════════════════════
// ── Cosmetics ────────────────────────────────────────────
// ══════════════════════════════════════════════════════════

function printHeader(file: string, follow: boolean): void {
  const name = path.basename(file);
  const mode = follow ? 'tailing' : 'reading';
  console.log(`\x1b[36m── ${mode} ${name} ──\x1b[0m`);
}

function printEmpty(): void {
  console.log();
  console.log('\x1b[33m  No logs found yet.\x1b[0m');
  console.log();
  console.log(
    `  \x1b[90mLog directory: ${HarubashiPaths.logsDir}\x1b[0m`,
  );
  console.log();
  console.log('\x1b[90m  Try starting the daemon first:\x1b[0m');
  console.log('    \x1b[32m$\x1b[0m harubashi daemon');
  console.log();
}

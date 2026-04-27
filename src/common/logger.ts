import * as fs from 'fs';
import * as path from 'path';
import * as winston from 'winston';
import 'winston-daily-rotate-file';
import { utilities as nestWinstonUtilities, WinstonModule } from 'nest-winston';
import { LoggerService } from '@nestjs/common';
import { HarubashiPaths } from './paths';

// ══════════════════════════════════════════════════════════
// ── Secret masking ───────────────────────────────────────
// ══════════════════════════════════════════════════════════

/**
 * Patterns matching secrets that may legitimately appear in log messages
 * or metadata. Each entry has a regex and a `redact` function that returns
 * the replacement (typically the recognizable prefix + `***`).
 */
const SECRET_PATTERNS: Array<{ regex: RegExp; redact: (match: string) => string }> = [
  // NVIDIA NIM keys: nvapi-XXXXXX...
  { regex: /(nvapi-)[A-Za-z0-9_\-]{20,}/g, redact: () => 'nvapi-***' },
  // Anthropic: sk-ant-XXXX
  { regex: /(sk-ant-[A-Za-z0-9_\-]{8,})/g, redact: () => 'sk-ant-***' },
  // OpenAI / generic: sk-XXXXXX (NOT sk-ant-)
  { regex: /\b(sk-)(?!ant-)[A-Za-z0-9_\-]{20,}/g, redact: () => 'sk-***' },
  // Google API keys: AIza... (39 chars typical)
  { regex: /\b(AIza)[A-Za-z0-9_\-]{30,}/g, redact: () => 'AIza***' },
  // Telegram bot tokens: <digits>:<35-50 base64-ish chars>
  { regex: /\b\d{6,}:[A-Za-z0-9_-]{30,}\b/g, redact: () => '***BOT_TOKEN***' },
  // Bearer / Authorization tokens
  { regex: /(Bearer\s+)[A-Za-z0-9._\-]+/gi, redact: () => 'Bearer ***' },
];

/** Recursively mask secrets in any string-typed field of `value`. */
function maskString(s: string): string {
  let out = s;
  for (const { regex, redact } of SECRET_PATTERNS) {
    out = out.replace(regex, redact);
  }
  return out;
}

function maskAny(value: unknown, depth = 0): unknown {
  if (depth > 6) return value; // safety bound on cyclic / deep objects
  if (typeof value === 'string') return maskString(value);
  if (Array.isArray(value)) return value.map((v) => maskAny(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = maskAny(v, depth + 1);
    }
    return out;
  }
  return value;
}

/**
 * Winston format that walks every field of the log info object and
 * redacts known secret patterns. Runs *before* the final printer, so it
 * affects both the console and the file transport identically.
 */
const secretMasker = winston.format((info) => {
  for (const key of Object.keys(info)) {
    info[key] = maskAny(info[key]);
  }
  return info;
});

// ══════════════════════════════════════════════════════════
// ── Public factory ───────────────────────────────────────
// ══════════════════════════════════════════════════════════

export interface LoggerOptions {
  /** Application name for the console pretty formatter (default: "Harubashi"). */
  appName?: string;
  /** Log level (default: process.env.LOG_LEVEL || "info"). */
  level?: string;
}

/**
 * Build a NestJS-compatible Winston logger:
 *
 * - **Console transport** — colorized, NestJS-flavored pretty format.
 * - **File transport** — `~/.harubashi/logs/harubashi-YYYY-MM-DD.log`,
 *   one JSON object per line, rotated daily, kept for 14 days, max 20 MB.
 * - **Secret masker** — redacts API keys / bot tokens / Bearer tokens
 *   from both transports.
 *
 * Usage:
 * ```ts
 * const logger = createHarubashiLogger({ appName: 'Daemon' });
 * const app = await NestFactory.createApplicationContext(AppModule, { logger });
 * ```
 */
export function createHarubashiLogger(opts: LoggerOptions = {}): LoggerService {
  // Ensure log directory exists. It is normally created by `harubashi setup`,
  // but we do it again here defensively (e.g. user deleted it).
  fs.mkdirSync(HarubashiPaths.logsDir, { recursive: true });

  const level = opts.level || process.env.LOG_LEVEL || 'info';
  const appName = opts.appName || 'Harubashi';

  return WinstonModule.createLogger({
    level,
    transports: [
      // ── Console: colorized + Nest-style pretty ───────────
      new winston.transports.Console({
        format: winston.format.combine(
          secretMasker(),
          winston.format.timestamp(),
          winston.format.ms(),
          nestWinstonUtilities.format.nestLike(appName, {
            colors: true,
            prettyPrint: true,
          }),
        ),
      }),

      // ── File: strict JSON, daily rotation ────────────────
      new winston.transports.DailyRotateFile({
        dirname: HarubashiPaths.logsDir,
        filename: 'harubashi-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        maxFiles: '14d',
        maxSize: '20m',
        zippedArchive: false,
        format: winston.format.combine(
          secretMasker(),
          winston.format.timestamp(),
          winston.format.errors({ stack: true }),
          winston.format.json(),
        ),
      }),
    ],
  });
}

// ══════════════════════════════════════════════════════════
// ── File-discovery helpers (used by `harubashi logs`) ────
// ══════════════════════════════════════════════════════════

/**
 * Return all `harubashi-*.log` files in the logs dir, sorted oldest → newest.
 * Empty array if the dir does not exist or contains no log files.
 */
export function listLogFiles(): string[] {
  if (!fs.existsSync(HarubashiPaths.logsDir)) return [];

  const entries = fs.readdirSync(HarubashiPaths.logsDir);
  const matches = entries.filter(
    (f) => /^harubashi-\d{4}-\d{2}-\d{2}\.log$/.test(f),
  );
  return matches
    .map((f) => path.join(HarubashiPaths.logsDir, f))
    .sort(); // ISO date in name → lexical sort = chronological
}

/** Shortcut: latest log file or `null`. */
export function latestLogFile(): string | null {
  const files = listLogFiles();
  return files.length === 0 ? null : files[files.length - 1];
}

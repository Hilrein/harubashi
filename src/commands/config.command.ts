import { spawn } from 'child_process';
import * as fs from 'fs';
import { HarubashiPaths } from '../common/paths';

// ══════════════════════════════════════════════════════════
// ── config path ──────────────────────────────────────────
// ══════════════════════════════════════════════════════════

/**
 * `harubashi config path` — print the absolute path to the active
 * `config.yaml`. Output is intentionally bare (no decoration, no
 * trailing prose) so the path is pipeable:
 *
 *     cd $(dirname $(harubashi config path))
 *     code $(harubashi config path)
 */
export function runConfigPath(): void {
  console.log(HarubashiPaths.configFile);
}

// ══════════════════════════════════════════════════════════
// ── config edit ──────────────────────────────────────────
// ══════════════════════════════════════════════════════════

/**
 * `harubashi config edit` — open `config.yaml` in the user's preferred
 * editor.
 *
 * Resolution order:
 *  1. `$EDITOR` / `$VISUAL` env var (POSIX convention) — assumed to be a
 *     terminal editor (`vim`, `nano`, `code -w`, ...). Spawned with
 *     `stdio: 'inherit'` so the user can interact with it directly.
 *  2. Platform fallback to a GUI editor / opener:
 *     - win32  → `notepad.exe <path>`
 *     - darwin → `open -t <path>` (default text editor)
 *     - linux  → `xdg-open <path>` (default app)
 *     Spawned `detached + ignore` so the CLI returns immediately.
 *
 * If the file does not yet exist, prints a friendly hint to run
 * `harubashi setup` first instead of opening an empty file.
 */
export async function runConfigEdit(): Promise<void> {
  const file = HarubashiPaths.configFile;

  if (!fs.existsSync(file)) {
    console.error(
      `\x1b[31m[harubashi] Config not found at ${file}\x1b[0m`,
    );
    console.error(
      `\x1b[33mPlease run 'harubashi setup' first to create one.\x1b[0m`,
    );
    process.exit(1);
  }

  const editor = process.env.VISUAL || process.env.EDITOR;

  if (editor) {
    // Honor $EDITOR / $VISUAL. Treat as a terminal editor: take over the TTY.
    // The shell-style invocation lets users set EDITOR='code -w' or similar.
    await runTerminalEditor(editor, file);
    return;
  }

  runPlatformDefault(file);
}

/**
 * Run a terminal editor specified by `$EDITOR` / `$VISUAL`. Uses
 * `shell: true` so values like `code -w` (with arguments) work as
 * users expect.
 */
function runTerminalEditor(editor: string, file: string): Promise<void> {
  return new Promise<void>((resolve) => {
    console.log(`\x1b[90m  Opening ${file} in '${editor}'...\x1b[0m`);
    // Quote the file path defensively for shells that split on spaces.
    const quoted = `"${file.replace(/"/g, '\\"')}"`;
    const child = spawn(`${editor} ${quoted}`, {
      stdio: 'inherit',
      shell: true,
    });
    child.on('exit', (code) => {
      if (code === 0) {
        console.log(`\x1b[32m✓\x1b[0m  Closed editor.`);
      } else {
        console.log(
          `\x1b[33m⚠\x1b[0m  Editor exited with code ${code ?? 'unknown'}.`,
        );
      }
      resolve();
    });
    child.on('error', (err) => {
      console.error(
        `\x1b[31m[harubashi] Failed to launch '${editor}': ${err.message}\x1b[0m`,
      );
      console.log(`  Path: \x1b[36m${file}\x1b[0m`);
      resolve();
    });
  });
}

/**
 * Open `file` with the platform's default text-edit app (no `$EDITOR`).
 * Detached + unref'd so the CLI exits immediately even if the GUI app
 * keeps running.
 */
function runPlatformDefault(file: string): void {
  const platform = process.platform;
  let command: string;
  let args: string[];

  if (platform === 'win32') {
    // notepad.exe is always present and, unlike `start`, doesn't need a shell.
    command = 'notepad.exe';
    args = [file];
  } else if (platform === 'darwin') {
    // `open -t` forces TextEdit (plain-text editor), avoiding "open with VSCode".
    command = 'open';
    args = ['-t', file];
  } else {
    // freedesktop-compatible Linux/BSD; opens the user's default app for .yaml.
    command = 'xdg-open';
    args = [file];
  }

  try {
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
    });
    child.on('error', (err) => {
      console.error(
        `\x1b[31m[harubashi] Failed to launch '${command}': ${err.message}\x1b[0m`,
      );
      console.log(`  Path: \x1b[36m${file}\x1b[0m`);
    });
    child.unref();
    console.log(`\x1b[32m✓\x1b[0m  Opening ${file}`);
    console.log(
      `\x1b[90m  Tip: set $EDITOR (e.g. 'export EDITOR=vim') to control this command.\x1b[0m`,
    );
  } catch (err) {
    console.error(
      `\x1b[31m[harubashi] Failed to spawn editor: ${(err as Error).message}\x1b[0m`,
    );
    console.log(`  Path: \x1b[36m${file}\x1b[0m`);
  }
}

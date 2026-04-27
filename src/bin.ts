#!/usr/bin/env node
import 'reflect-metadata';
import * as fs from 'fs';
import { Command } from 'commander';
import { HarubashiPaths } from './common/paths';

const program = new Command();

program
  .name('harubashi')
  .description('Headless system-use AI agent — global CLI')
  .version('0.1.0');

// ══════════════════════════════════════════════════════════
// ── Helpers ──────────────────────────────────────────────
// ══════════════════════════════════════════════════════════

function ensureConfigOrExit(): void {
  if (!fs.existsSync(HarubashiPaths.configFile)) {
    console.error(
      `\x1b[31m[harubashi] Config not found at ${HarubashiPaths.configFile}\x1b[0m`,
    );
    console.error(`\x1b[33mPlease run 'harubashi setup' first.\x1b[0m`);
    process.exit(1);
  }
}

// ══════════════════════════════════════════════════════════
// ── Top-level commands ───────────────────────────────────
// ══════════════════════════════════════════════════════════

program
  .command('cli')
  .description('Launch the interactive REPL')
  .action(async () => {
    ensureConfigOrExit();
    const { runCli } = await import('./cli');
    await runCli();
  });

program
  .command('daemon')
  .description('Launch the Telegram-facing background daemon')
  .action(async () => {
    ensureConfigOrExit();
    const { runDaemon } = await import('./daemon');
    await runDaemon();
  });

program
  .command('setup')
  .description('Interactive setup wizard (creates ~/.harubashi/)')
  .action(async () => {
    const { runSetup } = await import('./commands/setup.command');
    await runSetup();
  });

program
  .command('logs')
  .description('Tail the Harubashi log file')
  .option('-f, --follow', 'follow new lines (default)', true)
  .option('--no-follow', 'print and exit (no tailing)')
  .option('-n, --lines <n>', 'lines to print before tailing', (v) => parseInt(v, 10), 50)
  .action(async (opts: { follow?: boolean; lines?: number }) => {
    const { runLogs } = await import('./commands/logs.command');
    await runLogs({ follow: opts.follow, lines: opts.lines });
  });

// ══════════════════════════════════════════════════════════
// ── Profile sub-commands ─────────────────────────────────
// ══════════════════════════════════════════════════════════

const profile = program
  .command('profile')
  .description('Manage configuration profiles');

profile
  .command('list')
  .description('List available profiles')
  .action(async () => {
    ensureConfigOrExit();
    const { runProfileList } = await import('./commands/profile.command');
    runProfileList();
  });

profile
  .command('use <name>')
  .description('Switch the active profile')
  .action(async (name: string) => {
    ensureConfigOrExit();
    const { runProfileUse } = await import('./commands/profile.command');
    runProfileUse(name);
  });

profile
  .command('create [name]')
  .description('Create a new profile (prompts for missing fields, pre-fills from active profile)')
  .action(async (name: string | undefined) => {
    ensureConfigOrExit();
    const { runProfileCreate } = await import('./commands/profile.command');
    await runProfileCreate(name);
  });

profile
  .command('edit [name]')
  .description('Edit an existing profile (skips DB init if .db already exists)')
  .action(async (name: string | undefined) => {
    ensureConfigOrExit();
    const { runProfileEdit } = await import('./commands/profile.command');
    await runProfileEdit(name);
  });

// ══════════════════════════════════════════════════════════
// ── Entrypoint ───────────────────────────────────────────
// ══════════════════════════════════════════════════════════

program.parseAsync(process.argv).catch((err) => {
  console.error('\x1b[31m[harubashi] Fatal error:\x1b[0m', err.message || err);
  process.exit(1);
});

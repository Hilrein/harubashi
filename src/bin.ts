#!/usr/bin/env node
import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';
import { HarubashiPaths } from './common/paths';

// Read the package version dynamically so `harubashi -V` always matches
// what was published to npm (or what's checked out in dev). Resolved
// relative to this file: dist/bin.js → dist/../package.json (= root).
const pkgPath = path.resolve(__dirname, '..', 'package.json');
const pkg: { version: string } = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

const program = new Command();

program
  .name('harubashi')
  .description('Headless system-use AI agent — global CLI')
  .version(pkg.version, '-V, --version', 'output the current version');

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

program
  .command('ui')
  .description('Launch the graphical Web UI dashboard')
  .option('-p, --port <port>', 'HTTP port to listen on', (v) => parseInt(v, 10))
  .action(async (opts: { port?: number }) => {
    ensureConfigOrExit();
    const { runWebUi } = await import('./web-ui');
    await runWebUi({ port: opts.port });
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

profile
  .command('delete <name>')
  .description('Delete a profile (DB file + config entry); refuses the active profile')
  .action(async (name: string) => {
    ensureConfigOrExit();
    const { runProfileDelete } = await import('./commands/profile.command');
    await runProfileDelete(name);
  });

// ══════════════════════════════════════════════════════════
// ── Skills sub-commands ──────────────────────────────────
// ══════════════════════════════════════════════════════════

const skills = program
  .command('skills')
  .description('Inspect installed skills (~/.harubashi/skills/)');

skills
  .command('list')
  .description('List installed skills, grouped by Active Tools and Guidance')
  .action(async () => {
    const { runSkillsList } = await import('./commands/skills.command');
    runSkillsList();
  });

skills
  .command('open')
  .description("Open the skills directory in the OS file manager")
  .action(async () => {
    const { runSkillsOpen } = await import('./commands/skills.command');
    runSkillsOpen();
  });

// ══════════════════════════════════════════════════════════
// ── Config sub-commands ──────────────────────────────────
// ══════════════════════════════════════════════════════════

const config = program
  .command('config')
  .description('Inspect the global Harubashi config');

config
  .command('path')
  .description('Print the absolute path to config.yaml (pipeable, no decoration)')
  .action(async () => {
    const { runConfigPath } = await import('./commands/config.command');
    runConfigPath();
  });

config
  .command('edit')
  .description('Open config.yaml in $EDITOR (or platform default text editor)')
  .action(async () => {
    const { runConfigEdit } = await import('./commands/config.command');
    await runConfigEdit();
  });

// ══════════════════════════════════════════════════════════
// ── Entrypoint ───────────────────────────────────────────
// ══════════════════════════════════════════════════════════

program.parseAsync(process.argv).catch((err) => {
  console.error('\x1b[31m[harubashi] Fatal error:\x1b[0m', err.message || err);
  process.exit(1);
});

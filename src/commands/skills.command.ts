import { spawn } from 'child_process';
import * as fs from 'fs';
import { HarubashiPaths } from '../common/paths';
import { ParsedSkill } from '../skills/skills.types';
import { loadAllSkillFiles } from '../skills/skills-parser';
import { copyBundledSkillsTo } from '../skills/skills-bundle';

// ══════════════════════════════════════════════════════════
// ── skills list ──────────────────────────────────────────
// ══════════════════════════════════════════════════════════

/**
 * `harubashi skills list` — show all skills currently installed in
 * `~/.harubashi/skills/`, split into Active Tools and Guidance.
 *
 * Standalone (no NestJS boot) — uses the pure `loadAllSkillFiles` parser
 * so the command runs instantly and works even if `config.yaml` is
 * missing or invalid.
 */
export function runSkillsList(): void {
  const dir = HarubashiPaths.skillsDir;

  // Self-heal: additively copy any newly bundled skills (zero overwrite,
  // user edits preserved). Lets `npm i -g harubashi@latest` surface new
  // skills immediately, even without booting `cli`/`daemon`.
  const copy = copyBundledSkillsTo(dir);

  if (!fs.existsSync(dir)) {
    printEmpty('directory does not exist');
    return;
  }

  const skills = loadAllSkillFiles(dir);

  if (skills.length === 0) {
    printEmpty('directory is empty');
    return;
  }

  const tools = skills.filter((s) => s.tool);
  const guidance = skills.filter((s) => !s.tool);

  console.log();
  console.log(`\x1b[36m── Skills (in ${dir}) ──\x1b[0m`);
  if (copy.added.length > 0) {
    console.log(
      `  \x1b[32m+ added ${copy.added.length} new bundled skill(s):\x1b[0m \x1b[90m${copy.added.join(', ')}\x1b[0m`,
    );
  }
  console.log();

  if (tools.length > 0) {
    console.log(`  \x1b[32mTools (${tools.length}):\x1b[0m`);
    printSection(tools);
    console.log();
  }

  if (guidance.length > 0) {
    console.log(`  \x1b[33mGuidance (${guidance.length}):\x1b[0m`);
    printSection(guidance);
    console.log();
  }

  console.log('\x1b[36m────────────────────────────────────────────────────\x1b[0m');
  console.log();
}

/**
 * Render a list of skills as aligned `name  description` rows.
 * Descriptions are truncated to fit the terminal width.
 */
function printSection(skills: ParsedSkill[]): void {
  const nameWidth = Math.max(...skills.map((s) => s.name.length));
  const termWidth = process.stdout.columns || 100;
  // Account for: 4 spaces indent + nameWidth + 2 spaces separator
  const descBudget = Math.max(20, termWidth - 4 - nameWidth - 2 - 1);

  for (const skill of skills) {
    const desc = describe(skill);
    const truncated =
      desc.length > descBudget ? desc.slice(0, descBudget - 1) + '…' : desc;
    console.log(
      `    \x1b[36m${skill.name.padEnd(nameWidth)}\x1b[0m  \x1b[90m${truncated}\x1b[0m`,
    );
  }
}

/**
 * Best-effort one-line description: prefer the `tool.description`
 * (frontmatter), fall back to the first non-empty line of the body.
 */
function describe(skill: ParsedSkill): string {
  if (skill.tool?.description) return skill.tool.description;

  // For guidance-only skills, the frontmatter `description` field is
  // captured into `tool.description` only when input_schema is present.
  // Recover it from the file by reading the first markdown line.
  const firstLine = skill.instructions
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !l.startsWith('#'));

  return firstLine || '(no description)';
}

function printEmpty(reason: string): void {
  console.log();
  console.log(`\x1b[33m  No skills found (${reason}).\x1b[0m`);
  console.log();
  console.log(`  \x1b[90mSkills directory: ${HarubashiPaths.skillsDir}\x1b[0m`);
  console.log();
  console.log('\x1b[90m  Run setup to install bundled skills:\x1b[0m');
  console.log('    \x1b[32m$\x1b[0m harubashi setup');
  console.log();
}

// ══════════════════════════════════════════════════════════
// ── skills open ──────────────────────────────────────────
// ══════════════════════════════════════════════════════════

/**
 * `harubashi skills open` — reveal the skills directory in the OS
 * file manager. Cross-platform via `child_process.spawn` (no shell, no
 * quoting hazards). Falls back to printing the absolute path on any
 * spawn error so the user can `cd` manually.
 */
export function runSkillsOpen(): void {
  const dir = HarubashiPaths.skillsDir;

  // Ensure the directory exists, since `open`/`xdg-open` will balk on missing paths.
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const platform = process.platform;
  let command: string;
  let args: string[];

  if (platform === 'win32') {
    command = 'explorer.exe';
    args = [dir];
  } else if (platform === 'darwin') {
    command = 'open';
    args = [dir];
  } else {
    // Assume freedesktop.org-compliant Linux/BSD with xdg-utils.
    command = 'xdg-open';
    args = [dir];
  }

  try {
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
    });
    child.on('error', () => printFallback(dir));
    child.unref();
    console.log(`\x1b[32m✓\x1b[0m  Opening ${dir}`);
  } catch {
    printFallback(dir);
  }
}

function printFallback(dir: string): void {
  console.log();
  console.log('\x1b[33m  Could not auto-open the folder.\x1b[0m');
  console.log(`  Path: \x1b[36m${dir}\x1b[0m`);
  console.log();
}

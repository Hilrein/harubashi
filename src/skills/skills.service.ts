import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import * as chokidar from 'chokidar';
import * as fs from 'fs';
import * as path from 'path';
import { ToolDefinition } from '../common/types/tool.types';
import { ParsedSkill } from './skills.types';
import { HarubashiPaths } from '../common/paths';
import { copyBundledSkillsTo } from './skills-bundle';
import { parseSkillFile } from './skills-parser';

@Injectable()
export class SkillsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SkillsService.name);
  private readonly skills = new Map<string, ParsedSkill>();
  private watcher: chokidar.FSWatcher | null = null;
  private readonly definitionsDir: string;

  constructor() {
    // Skills live exclusively in the user's global directory.
    // Bundled definitions are copied here by `harubashi setup`.
    this.definitionsDir = HarubashiPaths.skillsDir;
  }

  async onModuleInit() {
    this.bootstrapFromBundle();
    this.loadAllSkills();
    this.startWatching();
  }

  async onModuleDestroy() {
    await this.stopWatching();
  }

  /**
   * Returns LLM-callable tool definitions. Guidance-only skills (those
   * without `input_schema` in their frontmatter) are excluded — they
   * inform the agent via the system prompt, not the tool list.
   */
  getTools(): ToolDefinition[] {
    return Array.from(this.skills.values())
      .filter((s): s is ParsedSkill & { tool: ToolDefinition } => !!s.tool)
      .map((s) => s.tool);
  }

  getSkill(name: string): ParsedSkill | undefined {
    return this.skills.get(name);
  }

  getAllSkills(): ParsedSkill[] {
    return Array.from(this.skills.values());
  }

  /**
   * Build the system-prompt augmentation by concatenating the markdown
   * body of EVERY loaded skill (both active tools and guidance-only).
   * Active tools are labeled `## Tool: <name>`; guidance is labeled
   * `## Guidance: <name>` so the agent can tell them apart.
   */
  getSkillInstructions(): string {
    const parts: string[] = [];
    for (const skill of this.skills.values()) {
      if (!skill.instructions.trim()) continue;
      const heading = skill.tool ? 'Tool' : 'Guidance';
      parts.push(`## ${heading}: ${skill.name}\n\n${skill.instructions}`);
    }
    return parts.join('\n\n---\n\n');
  }

  // ── Private ─────────────────────────────────────────────

  /**
   * Additive self-heal: on every boot, ensure that every bundled skill
   * exists in `~/.harubashi/skills/`. Files already present (including
   * user-edited ones) are NEVER overwritten. New bundle entries shipped
   * in a future npm version are added automatically.
   *
   * This guarantees:
   *  - Fresh install / missing dir → all bundled skills are copied.
   *  - Existing dir + new bundle skills → only the new ones are added.
   *  - Existing dir + everything in sync → no-op, silent (debug-level only).
   *  - Broken install (bundle source missing) → warn, continue with whatever
   *    is already on disk; the daemon may boot with zero skills but does
   *    not crash.
   */
  private bootstrapFromBundle(): void {
    const result = copyBundledSkillsTo(this.definitionsDir);

    if (result.bundleMissing) {
      this.logger.warn(
        `Bundled skills directory not found at ${result.src}. ` +
          `Auto-heal disabled; the agent will use only what is currently in ` +
          `${this.definitionsDir}.`,
      );
      return;
    }

    if (result.added.length > 0) {
      this.logger.log(
        `Auto-heal: added ${result.added.length} bundled skill(s) → ` +
          `[${result.added.join(', ')}] (${result.kept.length} existing skill(s) preserved)`,
      );
    } else {
      this.logger.debug(
        `Auto-heal: ${result.kept.length} bundled skill(s) already in place; nothing to add.`,
      );
    }
  }

  private loadAllSkills(): void {
    if (!fs.existsSync(this.definitionsDir)) {
      this.logger.warn(
        `Skills definitions directory not found: ${this.definitionsDir}`,
      );
      return;
    }

    const files = fs
      .readdirSync(this.definitionsDir)
      .filter((f) => f.endsWith('.md'));

    for (const file of files) {
      this.loadSkillFile(path.join(this.definitionsDir, file));
    }

    const tools = Array.from(this.skills.values()).filter((s) => s.tool).length;
    const guidance = this.skills.size - tools;
    this.logger.log(
      `Loaded ${this.skills.size} skill(s): ${tools} tool(s) + ${guidance} guidance ` +
        `[${Array.from(this.skills.keys()).join(', ')}]`,
    );
  }

  private loadSkillFile(filePath: string): void {
    const result = parseSkillFile(filePath);

    if (result.error || !result.skill) {
      this.logger.warn(
        `Skill file "${filePath}" skipped: ${result.error || 'unknown error'}`,
      );
      return;
    }

    const skill = result.skill;
    this.skills.set(skill.name, skill);

    const kind = skill.tool ? 'tool' : 'guidance';
    this.logger.debug(
      `Loaded ${kind}: ${skill.name} from ${path.basename(filePath)}`,
    );
  }

  private removeSkillByPath(filePath: string): void {
    for (const [name, skill] of this.skills.entries()) {
      if (skill.filePath === filePath) {
        this.skills.delete(name);
        this.logger.log(`Removed skill: ${name}`);
        return;
      }
    }
  }

  private startWatching(): void {
    if (!fs.existsSync(this.definitionsDir)) return;

    this.watcher = chokidar.watch('*.md', {
      cwd: this.definitionsDir,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
    });

    this.watcher
      .on('add', (relative) => {
        const full = path.join(this.definitionsDir, relative);
        this.logger.log(`Skill file added: ${relative}`);
        this.loadSkillFile(full);
      })
      .on('change', (relative) => {
        const full = path.join(this.definitionsDir, relative);
        this.logger.log(`Skill file changed: ${relative} — hot-reloading`);
        this.removeSkillByPath(full);
        this.loadSkillFile(full);
      })
      .on('unlink', (relative) => {
        const full = path.join(this.definitionsDir, relative);
        this.logger.log(`Skill file removed: ${relative}`);
        this.removeSkillByPath(full);
      });

    this.logger.log(`Watching for skill changes in ${this.definitionsDir}`);
  }

  private async stopWatching(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
      this.logger.log('Skill watcher stopped');
    }
  }
}

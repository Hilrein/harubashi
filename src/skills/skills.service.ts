import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import * as chokidar from 'chokidar';
import * as matter from 'gray-matter';
import * as fs from 'fs';
import * as path from 'path';
import { ToolDefinition } from '../common/types/tool.types';
import { ParsedSkill, SkillFrontmatter } from './skills.types';
import { HarubashiPaths } from '../common/paths';
import { copyBundledSkillsTo } from './skills-bundle';

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
   * Self-heal step: if `~/.harubashi/skills/` is missing or empty (e.g.
   * the user accidentally deleted it, or this is a fresh install where
   * `setup` has not yet run), copy the bundled `.md` skills into place.
   *
   * Idempotent and silent on the happy path. On a broken install where
   * the bundle source itself is missing, we log a warning and let
   * `loadAllSkills()` proceed — the daemon will simply have zero skills,
   * which is preferable to a hard crash.
   */
  private bootstrapFromBundle(): void {
    const exists = fs.existsSync(this.definitionsDir);
    const isEmpty =
      exists &&
      fs.readdirSync(this.definitionsDir).filter((f) => f.endsWith('.md'))
        .length === 0;

    if (exists && !isEmpty) return; // happy path

    const reason = !exists ? 'missing' : 'empty';
    const result = copyBundledSkillsTo(this.definitionsDir);

    if (result.copied === 0) {
      this.logger.warn(
        `Skills directory was ${reason} and no bundled skills were found at ${result.src}. ` +
          `The agent will boot with zero skills.`,
      );
      return;
    }

    this.logger.log(
      `Auto-healed skills from bundled package (${result.copied} file(s)) ` +
        `into ${this.definitionsDir}`,
    );
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
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const { data, content } = matter(raw);
      const frontmatter = data as SkillFrontmatter;

      if (!frontmatter.name || !frontmatter.description) {
        this.logger.warn(
          `Skill file "${filePath}" is missing required frontmatter fields (name, description). Skipping.`,
        );
        return;
      }

      // `input_schema` is optional. Skills without it become guidance-only:
      // their body augments the system prompt but no LLM tool is registered.
      const tool: ToolDefinition | undefined = frontmatter.input_schema
        ? {
            name: frontmatter.name,
            description: frontmatter.description,
            input_schema: {
              type: 'object',
              properties: frontmatter.input_schema.properties || {},
              required: frontmatter.input_schema.required,
            },
          }
        : undefined;

      const skill: ParsedSkill = {
        name: frontmatter.name,
        tool,
        instructions: content.trim(),
        filePath,
      };

      this.skills.set(frontmatter.name, skill);
      const kind = tool ? 'tool' : 'guidance';
      this.logger.debug(
        `Loaded ${kind}: ${frontmatter.name} from ${path.basename(filePath)}`,
      );
    } catch (err) {
      this.logger.error(`Failed to parse skill file "${filePath}": ${err.message}`);
    }
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

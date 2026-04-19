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

@Injectable()
export class SkillsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SkillsService.name);
  private readonly skills = new Map<string, ParsedSkill>();
  private watcher: chokidar.FSWatcher | null = null;
  private readonly definitionsDir: string;

  constructor() {
    this.definitionsDir = path.resolve(__dirname, 'definitions');
  }

  async onModuleInit() {
    this.loadAllSkills();
    this.startWatching();
  }

  async onModuleDestroy() {
    await this.stopWatching();
  }

  getTools(): ToolDefinition[] {
    return Array.from(this.skills.values()).map((s) => s.tool);
  }

  getSkill(name: string): ParsedSkill | undefined {
    return this.skills.get(name);
  }

  getAllSkills(): ParsedSkill[] {
    return Array.from(this.skills.values());
  }

  getSkillInstructions(): string {
    const parts: string[] = [];
    for (const skill of this.skills.values()) {
      if (skill.instructions.trim()) {
        parts.push(`## Tool: ${skill.tool.name}\n\n${skill.instructions}`);
      }
    }
    return parts.join('\n\n---\n\n');
  }

  // ── Private ─────────────────────────────────────────────

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

    this.logger.log(`Loaded ${this.skills.size} skill(s): [${Array.from(this.skills.keys()).join(', ')}]`);
  }

  private loadSkillFile(filePath: string): void {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const { data, content } = matter(raw);
      const frontmatter = data as SkillFrontmatter;

      if (!frontmatter.name || !frontmatter.description || !frontmatter.input_schema) {
        this.logger.warn(
          `Skill file "${filePath}" is missing required frontmatter fields (name, description, input_schema). Skipping.`,
        );
        return;
      }

      const tool: ToolDefinition = {
        name: frontmatter.name,
        description: frontmatter.description,
        input_schema: {
          type: 'object',
          properties: frontmatter.input_schema.properties || {},
          required: frontmatter.input_schema.required,
        },
      };

      const skill: ParsedSkill = {
        tool,
        instructions: content.trim(),
        filePath,
      };

      this.skills.set(frontmatter.name, skill);
      this.logger.debug(`Loaded skill: ${frontmatter.name} from ${path.basename(filePath)}`);
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

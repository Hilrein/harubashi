import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Runtime context injected into the system prompt on every agent turn.
 * All fields are required; callers resolve them upstream (see AgentProcessorService).
 */
export interface SoulContext {
  userName: string;
  now: string;
  os: string;
  host: string;
  nodeVersion: string;
  cwd: string;
  llmProvider: string;
}

/**
 * Ordered fragments assembled into the final system prompt.
 * Order matters: identity first, then voice, then hard rules, then tools, then runtime state last.
 */
const FRAGMENT_ORDER = ['core', 'voice', 'rules'] as const;
const RUNTIME_FRAGMENT = 'runtime';

@Injectable()
export class SoulService implements OnModuleInit {
  private readonly logger = new Logger(SoulService.name);
  private readonly promptsDir: string;
  private readonly prompts = new Map<string, string>();

  constructor() {
    this.promptsDir = path.resolve(__dirname, 'prompts');
  }

  onModuleInit() {
    this.loadAllPrompts();
  }

  /**
   * Build the full system prompt for this turn.
   *
   * Assembly order:
   *   core → voice → rules → [tools, if any] → runtime (with ctx injected)
   */
  getSystemPrompt(ctx: SoulContext, skillInstructions?: string): string {
    const vars = this.toTemplateVars(ctx);
    const parts: string[] = [];

    for (const name of FRAGMENT_ORDER) {
      const raw = this.prompts.get(name);
      if (raw) parts.push(this.renderTemplate(raw, vars));
    }

    if (skillInstructions?.trim()) {
      parts.push(`# Tools\n\n${skillInstructions}`);
    }

    const runtime = this.prompts.get(RUNTIME_FRAGMENT);
    if (runtime) parts.push(this.renderTemplate(runtime, vars));

    return parts.join('\n\n---\n\n');
  }

  getPrompt(name: string): string | undefined {
    return this.prompts.get(name);
  }

  // ── Private ─────────────────────────────────────────────

  private toTemplateVars(ctx: SoulContext): Record<string, string> {
    return {
      USER_NAME: ctx.userName,
      NOW: ctx.now,
      OS: ctx.os,
      HOST: ctx.host,
      NODE_VERSION: ctx.nodeVersion,
      CWD: ctx.cwd,
      LLM_PROVIDER: ctx.llmProvider,
    };
  }

  /**
   * Replace every `{{VAR}}` in the template with the matching entry from `vars`.
   * Missing keys render as empty string and log a warning — fail-soft by design.
   */
  private renderTemplate(
    template: string,
    vars: Record<string, string>,
  ): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
      if (key in vars) return vars[key];
      this.logger.warn(`Template variable "${key}" has no value — rendering as empty`);
      return '';
    });
  }

  private loadAllPrompts(): void {
    if (!fs.existsSync(this.promptsDir)) {
      this.logger.warn(
        `Soul prompts directory not found: ${this.promptsDir}`,
      );
      return;
    }

    const files = fs
      .readdirSync(this.promptsDir)
      .filter((f) => f.endsWith('.md'));

    for (const file of files) {
      const name = path.basename(file, '.md');
      const content = fs.readFileSync(
        path.join(this.promptsDir, file),
        'utf-8',
      );
      this.prompts.set(name, content.trim());
      this.logger.debug(`Loaded soul prompt: ${name}`);
    }

    this.logger.log(
      `Loaded ${this.prompts.size} soul prompt(s): [${Array.from(this.prompts.keys()).join(', ')}]`,
    );
  }
}

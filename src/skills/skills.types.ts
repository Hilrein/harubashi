import { ToolDefinition } from '../common/types/tool.types';

/**
 * A loaded skill. May be one of two kinds:
 *
 * - **Active tool** — has `tool` set; appears in `getTools()` and is
 *   exposed to the LLM as a callable function.
 * - **Guidance-only** — `tool` is `undefined`; never exposed as a tool,
 *   but its `instructions` are concatenated into the agent's system
 *   prompt via `getSkillInstructions()`. Used to teach the agent how to
 *   wield existing tools (e.g. `directory_explorer`, `git_manager`).
 */
export interface ParsedSkill {
  /** The skill's identifier (denormalized from frontmatter `name`). */
  name: string;
  /** Defined only for active tools; `undefined` for guidance-only skills. */
  tool?: ToolDefinition;
  /** Markdown body of the skill file (the section after the frontmatter). */
  instructions: string;
  /** Absolute path on disk; used by the file-watcher for hot-reload. */
  filePath: string;
}

export interface SkillFrontmatter {
  name: string;
  description: string;
  /**
   * Optional. When present, the skill becomes a callable tool. When
   * absent, the skill is guidance-only: its body is added to the system
   * prompt but no LLM tool is registered.
   */
  input_schema?: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

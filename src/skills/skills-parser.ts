import * as fs from 'fs';
import * as path from 'path';
import * as matter from 'gray-matter';
import { ToolDefinition } from '../common/types/tool.types';
import { ParsedSkill, SkillFrontmatter } from './skills.types';

// ══════════════════════════════════════════════════════════
// ── Pure parsing (no DI, no logger) ──────────────────────
// ══════════════════════════════════════════════════════════

/**
 * Result of attempting to parse a single `.md` skill file.
 * - `skill` is set on success.
 * - `error` is set on validation or read failure (caller decides how to log).
 */
export interface ParseResult {
  filePath: string;
  skill?: ParsedSkill;
  error?: string;
}

/**
 * Parse a single skill `.md` file. Pure function — no logger, no
 * side-effects beyond reading the file from disk.
 *
 * Returns `{ error }` when frontmatter is missing required fields
 * (`name`, `description`) or the file cannot be read. Callers (e.g.
 * `SkillsService`, `harubashi skills list`) wrap the result in their
 * preferred reporting style.
 *
 * `input_schema` is optional: when present the skill becomes a callable
 * tool, when absent it becomes guidance-only (system-prompt augmentation).
 */
export function parseSkillFile(filePath: string): ParseResult {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    return { filePath, error: `cannot read file: ${(err as Error).message}` };
  }

  let data: unknown;
  let content: string;
  try {
    const parsed = matter(raw);
    data = parsed.data;
    content = parsed.content;
  } catch (err) {
    return {
      filePath,
      error: `invalid frontmatter: ${(err as Error).message}`,
    };
  }

  const frontmatter = data as SkillFrontmatter;

  if (!frontmatter.name || !frontmatter.description) {
    return {
      filePath,
      error: 'missing required frontmatter fields (name, description)',
    };
  }

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

  return { filePath, skill };
}

/**
 * Enumerate `*.md` files in `dir` and parse each. Files that fail to
 * parse are silently skipped (caller can re-parse with `parseSkillFile`
 * directly if it wants per-file error reporting).
 *
 * Returns `[]` if `dir` does not exist.
 */
export function loadAllSkillFiles(dir: string): ParsedSkill[] {
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
  const skills: ParsedSkill[] = [];

  for (const file of files) {
    const result = parseSkillFile(path.join(dir, file));
    if (result.skill) skills.push(result.skill);
  }

  return skills;
}

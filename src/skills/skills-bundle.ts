import * as fs from 'fs';
import * as path from 'path';
import { HarubashiPaths } from '../common/paths';

/**
 * Result of `copyBundledSkillsTo`. Caller decides how to log/report this.
 */
export interface CopyResult {
  /** Absolute path of the bundled source dir we copied from. */
  src: string;
  /** Number of `.md` files copied (0 if the source did not exist). */
  copied: number;
}

/**
 * Pure copy logic — copies every `*.md` skill file from the bundled
 * `<package>/skills/definitions/` directory into `destDir`. Idempotent
 * (overwrites existing files).
 *
 * Side-effects: creates `destDir` if it doesn't exist, writes files. Does
 * NOT log to console — callers are responsible for human-readable output.
 *
 * Returns `{ copied: 0 }` if the bundle source does not exist (broken
 * install, never-built source tree). Callers should warn and continue.
 */
export function copyBundledSkillsTo(destDir: string): CopyResult {
  const src = HarubashiPaths.bundledSkillsDir();

  if (!fs.existsSync(src)) {
    return { src, copied: 0 };
  }

  fs.mkdirSync(destDir, { recursive: true });

  const files = fs.readdirSync(src).filter((f) => f.endsWith('.md'));
  for (const file of files) {
    fs.copyFileSync(path.join(src, file), path.join(destDir, file));
  }

  return { src, copied: files.length };
}

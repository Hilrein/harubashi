import * as fs from 'fs';
import * as path from 'path';
import { HarubashiPaths } from '../common/paths';

/**
 * Outcome of `copyBundledSkillsTo`. Caller decides how to log/report.
 *
 * - `added`   — bundle files newly copied (did not exist in `destDir`).
 * - `kept`    — bundle files already present in `destDir`; preserved as-is
 *               so the user's edits are never overwritten.
 * - `bundleMissing` — `true` when the bundle source itself is missing.
 *               Indicates a broken install / never-built source tree.
 */
export interface CopyResult {
  /** Absolute path of the bundled source dir we copied from. */
  src: string;
  /** Bundle files newly copied to `destDir`. */
  added: string[];
  /** Bundle files that already existed in `destDir` (left untouched). */
  kept: string[];
  /** `true` when the bundle source directory does not exist. */
  bundleMissing: boolean;
}

/**
 * **Additive** copy from the bundled skills directory into `destDir`.
 *
 * For every `*.md` in the bundle:
 *  - if a file with the same name does NOT exist in `destDir` → copy it
 *    and add to `added`.
 *  - if it DOES exist → leave the user's copy untouched and add to `kept`.
 *
 * This is the upgrade-safe behaviour: shipping a new bundled skill in a
 * future npm version automatically lands it in the user's directory on
 * the next daemon boot, while their hand-edited versions of existing
 * skills are preserved verbatim.
 *
 * Side-effects: creates `destDir` if it doesn't exist; writes only to
 * non-existing files. Does NOT log — callers handle human-readable output.
 */
export function copyBundledSkillsTo(destDir: string): CopyResult {
  const src = HarubashiPaths.bundledSkillsDir();

  if (!fs.existsSync(src)) {
    return { src, added: [], kept: [], bundleMissing: true };
  }

  fs.mkdirSync(destDir, { recursive: true });

  const bundleFiles = fs.readdirSync(src).filter((f) => f.endsWith('.md'));
  const added: string[] = [];
  const kept: string[] = [];

  for (const file of bundleFiles) {
    const destPath = path.join(destDir, file);
    if (fs.existsSync(destPath)) {
      kept.push(file);
      continue;
    }
    fs.copyFileSync(path.join(src, file), destPath);
    added.push(file);
  }

  return { src, added, kept, bundleMissing: false };
}

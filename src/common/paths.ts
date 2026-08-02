import * as os from 'os';
import * as path from 'path';

/**
 * Centralised filesystem layout for the global Harubashi installation.
 * All paths resolve under the user's home directory (`~/.harubashi/`).
 */

const ROOT = path.join(os.homedir(), '.harubashi');

export const HarubashiPaths = {
  root: ROOT,
  configFile: path.join(ROOT, 'config.yaml'),
  databasesDir: path.join(ROOT, 'databases'),
  skillsDir: path.join(ROOT, 'skills'),
  logsDir: path.join(ROOT, 'logs'),
  downloadsDir: path.join(ROOT, 'downloads'),
  logFile: path.join(ROOT, 'logs', 'harubashi.log'),

  /** Path to the SQLite file for a given profile. */
  databaseFile(profile: string): string {
    return path.join(ROOT, 'databases', `${profile}.db`);
  },

  /**
   * Prisma datasource URL for a given profile.
   * Prisma requires forward slashes even on Windows (after the drive letter).
   */
  databaseUrl(profile: string): string {
    const filePath = this.databaseFile(profile).replace(/\\/g, '/');
    return `file:${filePath}`;
  },

  /**
   * Resolve the bundled Prisma schema shipped inside the npm package.
   * Works both in `dist/` (production) and `src/` (ts-node dev).
   */
  bundledSchemaPath(): string {
    // From dist/common/paths.js  → ../../prisma/schema.prisma
    // From src/common/paths.ts   → ../../prisma/schema.prisma
    return path.resolve(__dirname, '..', '..', 'prisma', 'schema.prisma');
  },

  /**
   * Resolve the bundled skills shipped inside the npm package.
   * SetupCommand copies these to ~/.harubashi/skills/.
   */
  bundledSkillsDir(): string {
    return path.resolve(__dirname, '..', 'skills', 'definitions');
  },
};

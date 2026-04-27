import * as fs from 'fs';
import { spawn } from 'child_process';
import { confirm, input, password, select } from '@inquirer/prompts';
import { HarubashiPaths } from '../common/paths';
import { DEFAULT_USER_ID, DEFAULT_USER_NAME } from '../common/constants';
import { copyBundledSkillsTo } from '../skills/skills-bundle';
import {
  HarubashiConfig,
  ProviderName,
  ProvidersBlock,
  TelegramConfig,
} from '../config/config.types';

// ══════════════════════════════════════════════════════════
// ── Provider catalog ─────────────────────────────────────
// ══════════════════════════════════════════════════════════

export interface ProviderChoice {
  value: ProviderName;
  label: string;
  comingSoon: boolean;
  /** Curated list of common models. `null` → free-form input only. */
  models: string[] | null;
}

export const PROVIDERS: ProviderChoice[] = [
  {
    value: 'nvidia',
    label: 'NVIDIA NIM',
    comingSoon: false,
    models: ['meta/llama-3.1-70b-instruct', 'meta/llama-3.1-405b-instruct'],
  },
  {
    value: 'google',
    label: 'Google Gemini (AI Studio)',
    comingSoon: false,
    models: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.5-flash'],
  },
  { value: 'anthropic', label: 'Anthropic',                 comingSoon: true, models: null },
  { value: 'openai',    label: 'OpenAI',                    comingSoon: true, models: null },
  { value: 'proxy',     label: 'OpenAI-compatible Proxy',   comingSoon: true, models: null },
];

export function prettyProviderName(name: ProviderName): string {
  return PROVIDERS.find((p) => p.value === name)?.label || name;
}

const CUSTOM_MODEL_SENTINEL = '__custom__';

// ══════════════════════════════════════════════════════════
// ── Prompt helpers ───────────────────────────────────────
// ══════════════════════════════════════════════════════════

/**
 * Discriminated result of `askSelectOrCreateProfile`.
 * - `create` → user picked the "[+] Create new profile..." entry
 * - `edit`   → user picked an existing profile (name carries the choice)
 */
export type ProfileSelection =
  | { mode: 'create' }
  | { mode: 'edit'; name: string };

/**
 * Inquirer prompt shown when a config already exists. Lets the user either
 * create a brand-new profile or pick an existing one to edit. Each existing
 * entry is annotated with its provider/model and an `(active)` marker.
 */
export async function askSelectOrCreateProfile(
  config: HarubashiConfig,
): Promise<ProfileSelection> {
  const CREATE = '__create__';
  const names = Object.keys(config.profiles);

  const choices = [
    {
      name: '\x1b[32m[+] Create new profile...\x1b[0m',
      value: CREATE,
    },
    ...names.map((n) => {
      const profile = config.profiles[n];
      const provider = profile.llmProvider;
      const block = profile.providers[provider] as { model?: string } | undefined;
      const model = block?.model || '(no model)';
      const isActive = n === config.activeProfile;
      const activeTag = isActive ? ' \x1b[90m(active)\x1b[0m' : '';
      return {
        name: `${n}${activeTag}  \x1b[90m· ${provider} · ${model}\x1b[0m`,
        value: n,
      };
    }),
  ];

  const selected = await select<string>({
    message: 'Select profile to configure:',
    default: config.activeProfile,
    choices,
  });

  return selected === CREATE
    ? { mode: 'create' }
    : { mode: 'edit', name: selected };
}

/**
 * Inquirer prompt: profile name. If `defaults.name` is provided, it is used
 * as the inquirer default value (Enter accepts it).
 */
export async function askProfileName(defaults?: {
  name?: string;
  forbidden?: Set<string>;
}): Promise<string> {
  return input({
    message: 'Profile name:',
    default: defaults?.name ?? 'default',
    validate: (v: string) => {
      if (!/^[a-z0-9_-]+$/i.test(v)) {
        return 'Use only letters, numbers, dashes, underscores';
      }
      if (defaults?.forbidden?.has(v)) {
        return `Profile "${v}" already exists`;
      }
      return true;
    },
  });
}

/**
 * Inquirer prompt: LLM provider. Coming-soon providers are flagged in yellow
 * but remain selectable so the user can prepare config.
 */
export async function askProvider(defaults?: {
  provider?: ProviderName;
}): Promise<ProviderName> {
  return select<ProviderName>({
    message: 'Choose your LLM provider:',
    default: defaults?.provider,
    choices: PROVIDERS.map((p) => ({
      name: p.comingSoon ? `${p.label} \x1b[33m(coming soon)\x1b[0m` : p.label,
      value: p.value,
    })),
  });
}

/**
 * Inquirer prompt: provider-specific credentials. For most providers this is
 * a single API key. Proxy additionally needs a base URL.
 *
 * If `defaults` is provided AND it covers the same provider, the prompts use
 * the existing values as inquirer defaults — Enter accepts them, enabling
 * the hybrid clone-active-profile flow.
 */
export async function askProviderCredentials(
  name: ProviderName,
  defaults?: ProvidersBlock,
): Promise<ProvidersBlock> {
  if (name === 'proxy') {
    const prev = defaults?.proxy;
    if (prev?.apiKey) {
      console.log(
        '\x1b[90m  ↪ Press Enter to keep the existing API key.\x1b[0m',
      );
    }
    const baseURL = await input({
      message: 'Proxy Base URL:',
      default: prev?.baseURL,
      validate: (v: string) =>
        /^https?:\/\//.test(v) || 'Must be a valid http(s) URL',
    });
    const apiKey = await password({
      message: 'Proxy API Key:',
      mask: '*',
      ...(prev?.apiKey ? { default: prev.apiKey } : {}),
    });
    return { proxy: { baseURL, apiKey } };
  }

  const prev = defaults?.[name] as { apiKey?: string } | undefined;
  if (prev?.apiKey) {
    console.log(
      '\x1b[90m  ↪ Press Enter to keep the existing API key.\x1b[0m',
    );
  }
  const apiKey = await password({
    message: `${prettyProviderName(name)} API Key:`,
    mask: '*',
    ...(prev?.apiKey ? { default: prev.apiKey } : {}),
  });
  return { [name]: { apiKey } } as ProvidersBlock;
}

/**
 * Inquirer prompt: model selection.
 *
 * - For providers with a curated list (Nvidia, Google): a `select` of common
 *   models + a "Custom..." escape hatch that opens a free-form `input`.
 * - For coming-soon providers: a free-form `input`.
 *
 * `defaults.model` is honoured: if it matches a curated entry, that entry is
 * pre-selected; if it is non-curated, "Custom..." is pre-selected and the
 * follow-up input is pre-filled.
 */
export async function askModel(
  name: ProviderName,
  defaults?: { model?: string },
): Promise<string> {
  const meta = PROVIDERS.find((p) => p.value === name)!;
  const curated = meta.models;

  // Free-form path (anthropic / openai / proxy)
  if (!curated) {
    return input({
      message: `${prettyProviderName(name)} model:`,
      default: defaults?.model,
      validate: (v: string) => v.trim().length > 0 || 'Model id required',
    });
  }

  // Determine pre-selected option
  const defaultModel = defaults?.model;
  let preselected: string | undefined;
  if (defaultModel && curated.includes(defaultModel)) {
    preselected = defaultModel;
  } else if (defaultModel) {
    preselected = CUSTOM_MODEL_SENTINEL;
  }

  const choice = await select<string>({
    message: `${prettyProviderName(name)} model:`,
    default: preselected,
    choices: [
      ...curated.map((m) => ({ name: m, value: m })),
      { name: 'Custom...', value: CUSTOM_MODEL_SENTINEL },
    ],
  });

  if (choice !== CUSTOM_MODEL_SENTINEL) {
    return choice;
  }

  return input({
    message: 'Custom model id:',
    default:
      defaultModel && !curated.includes(defaultModel) ? defaultModel : undefined,
    validate: (v: string) => v.trim().length > 0 || 'Model id required',
  });
}

/**
 * Inquirer prompt: optional Telegram setup. Pre-fills the bot token if a
 * previous one exists in `defaults`.
 */
export async function askTelegram(
  defaults?: TelegramConfig,
): Promise<TelegramConfig | undefined> {
  const wantsTelegram = await confirm({
    message: 'Set up Telegram right now?',
    default: defaults?.enabled === true,
  });

  if (!wantsTelegram) {
    console.log(
      '\x1b[90m  ↪ Skipped. You can configure it later by editing config.yaml.\x1b[0m',
    );
    return undefined;
  }

  if (defaults?.botToken) {
    console.log(
      '\x1b[90m  ↪ Press Enter to keep the existing bot token.\x1b[0m',
    );
  }
  const botToken = await password({
    message: 'Telegram Bot Token:',
    mask: '*',
    ...(defaults?.botToken ? { default: defaults.botToken } : {}),
  });
  return { enabled: true, botToken };
}

// ══════════════════════════════════════════════════════════
// ── Filesystem materialization ───────────────────────────
// ══════════════════════════════════════════════════════════

/** True if the SQLite database file for a given profile already exists. */
export function databaseExists(profileName: string): boolean {
  return fs.existsSync(HarubashiPaths.databaseFile(profileName));
}

/** Create the entire `~/.harubashi/` tree (idempotent). */
export function createDirectories(): void {
  fs.mkdirSync(HarubashiPaths.databasesDir, { recursive: true });
  fs.mkdirSync(HarubashiPaths.skillsDir, { recursive: true });
  fs.mkdirSync(HarubashiPaths.logsDir, { recursive: true });
  console.log(`  \x1b[32m✓\x1b[0m  Created ${HarubashiPaths.root}`);
}

/**
 * Copy bundled `.md` skill definitions into `~/.harubashi/skills/`
 * **additively**: skill files already present in the user's directory
 * are preserved (so re-running `setup` never clobbers hand-edited
 * skills). Newly-bundled skills shipped in a future npm version are
 * landed automatically.
 *
 * Delegates the actual copy to `copyBundledSkillsTo()` (shared with the
 * `SkillsService` auto-heal path) and adds setup-flavored console output.
 */
export function copyBundledSkills(): void {
  const result = copyBundledSkillsTo(HarubashiPaths.skillsDir);

  if (result.bundleMissing) {
    console.log(
      `  \x1b[33m⚠\x1b[0m  No bundled skills found at ${result.src}. Skipping.`,
    );
    return;
  }

  if (result.added.length > 0 && result.kept.length === 0) {
    console.log(
      `  \x1b[32m✓\x1b[0m  Installed ${result.added.length} skill(s) → ${HarubashiPaths.skillsDir}`,
    );
  } else if (result.added.length > 0) {
    console.log(
      `  \x1b[32m✓\x1b[0m  Added ${result.added.length} new skill(s) ` +
        `\x1b[90m(kept ${result.kept.length} existing)\x1b[0m → ${HarubashiPaths.skillsDir}`,
    );
  } else {
    console.log(
      `  \x1b[90m↪\x1b[0m  All ${result.kept.length} bundled skill(s) already present in ${HarubashiPaths.skillsDir}`,
    );
  }
}

/**
 * Run `prisma db push --schema=<bundled>` against the SQLite file for `profile`.
 * Spawns `npx prisma`; cross-platform via `shell: true` (required for npx on Windows).
 *
 * Throws if the schema is missing or `prisma db push` exits non-zero.
 */
export async function initializeDatabase(profileName: string): Promise<void> {
  const schemaPath = HarubashiPaths.bundledSchemaPath();
  const dbUrl = HarubashiPaths.databaseUrl(profileName);

  if (!fs.existsSync(schemaPath)) {
    throw new Error(
      `Bundled Prisma schema not found at ${schemaPath}. ` +
        `Did you forget to run \`npm run build\`?`,
    );
  }

  console.log(`  \x1b[90m↪ prisma db push (schema: ${schemaPath})\x1b[0m`);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      'npx',
      [
        'prisma',
        'db',
        'push',
        '--schema',
        schemaPath,
        '--skip-generate',
        '--accept-data-loss',
      ],
      {
        env: { ...process.env, DATABASE_URL: dbUrl },
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
      },
    );

    let stderr = '';
    child.stderr?.on('data', (chunk) => (stderr += chunk.toString()));
    child.stdout?.on('data', () => {
      /* swallow noisy prisma output */
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `prisma db push failed with exit code ${code}\n${stderr.trim()}`,
          ),
        );
      }
    });
  });

  console.log(
    `  \x1b[32m✓\x1b[0m  Created database at ${HarubashiPaths.databaseFile(profileName)}`,
  );
}

/**
 * Connect to a profile's SQLite file and upsert the default `Harunauts` user
 * so the daemon and CLI can attach to a known user record immediately.
 */
export async function upsertDefaultUser(profileName: string): Promise<void> {
  const { PrismaClient } = await import('@prisma/client');
  const url = HarubashiPaths.databaseUrl(profileName);
  const prisma = new PrismaClient({ datasources: { db: { url } } });

  try {
    await prisma.user.upsert({
      where: { id: DEFAULT_USER_ID },
      update: { name: DEFAULT_USER_NAME },
      create: { id: DEFAULT_USER_ID, name: DEFAULT_USER_NAME },
    });
    console.log(
      `  \x1b[32m✓\x1b[0m  Upserted default user "${DEFAULT_USER_NAME}"`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

// ══════════════════════════════════════════════════════════
// ── Cosmetics ────────────────────────────────────────────
// ══════════════════════════════════════════════════════════

export function printStep(n: number, title: string): void {
  console.log(
    `\n\x1b[36m── Step ${n}: ${title} ──────────────────────────\x1b[0m`,
  );
}

import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { HarubashiPaths } from '../common/paths';
import {
  ConfigInvalidError,
  ConfigMissingError,
  HarubashiConfig,
  Profile,
} from './config.types';

/**
 * Synchronously read and parse `~/.harubashi/config.yaml`.
 * Throws `ConfigMissingError` if the file does not exist.
 * Throws `ConfigInvalidError` if the YAML is malformed or required fields are missing.
 */
export function loadHarubashiConfig(): HarubashiConfig {
  const configPath = HarubashiPaths.configFile;

  if (!fs.existsSync(configPath)) {
    throw new ConfigMissingError(configPath);
  }

  let raw: unknown;
  try {
    const text = fs.readFileSync(configPath, 'utf-8');
    raw = yaml.load(text);
  } catch (err) {
    throw new ConfigInvalidError(
      `Failed to parse YAML at ${configPath}: ${(err as Error).message}`,
    );
  }

  if (!raw || typeof raw !== 'object') {
    throw new ConfigInvalidError('Config root must be an object.');
  }

  const cfg = raw as Partial<HarubashiConfig>;

  if (!cfg.activeProfile || typeof cfg.activeProfile !== 'string') {
    throw new ConfigInvalidError('Missing required field "activeProfile".');
  }
  if (!cfg.profiles || typeof cfg.profiles !== 'object') {
    throw new ConfigInvalidError('Missing required field "profiles".');
  }

  const active = cfg.profiles[cfg.activeProfile];
  if (!active) {
    throw new ConfigInvalidError(
      `activeProfile "${cfg.activeProfile}" does not exist in "profiles".`,
    );
  }
  if (!active.llmProvider) {
    throw new ConfigInvalidError(
      `Profile "${cfg.activeProfile}" is missing "llmProvider".`,
    );
  }
  if (!active.providers) {
    throw new ConfigInvalidError(
      `Profile "${cfg.activeProfile}" is missing "providers".`,
    );
  }

  return cfg as HarubashiConfig;
}

/** Return the resolved active profile object. */
export function getActiveProfile(config: HarubashiConfig): Profile {
  return config.profiles[config.activeProfile];
}

/**
 * Persist a config object to `~/.harubashi/config.yaml`.
 * Atomic: writes to a temp file then renames.
 */
export function saveHarubashiConfig(config: HarubashiConfig): void {
  const target = HarubashiPaths.configFile;
  const tmp = `${target}.tmp`;

  fs.mkdirSync(HarubashiPaths.root, { recursive: true });
  fs.writeFileSync(tmp, yaml.dump(config, { indent: 2, lineWidth: 120 }), 'utf-8');
  fs.renameSync(tmp, target);
}

/**
 * Flatten the active profile of a HarubashiConfig into the flat `KEY=value`
 * shape that existing services expect (preserves the original .env contract).
 *
 * Also computes DATABASE_URL from the active profile name.
 */
export function flattenForNestConfig(
  config: HarubashiConfig,
): Record<string, string | undefined> {
  const profile = getActiveProfile(config);
  const p = profile.providers;

  const flat: Record<string, string | undefined> = {
    // ── Database ────────────────────────────────────────────
    DATABASE_URL: HarubashiPaths.databaseUrl(config.activeProfile),

    // ── LLM provider selection ─────────────────────────────
    HARUBASHI_LLM_PROVIDER: profile.llmProvider,

    // ── Google Gemini (API-Key) ────────────────────────────
    GOOGLE_API_KEY: p.google?.apiKey,
    GOOGLE_GEMINI_MODEL: p.google?.model,

    // ── NVIDIA NIM ─────────────────────────────────────────
    NVIDIA_API_KEY: p.nvidia?.apiKey,
    NVIDIA_MODEL: p.nvidia?.model,
    NVIDIA_BASE_URL: p.nvidia?.baseURL,

    // ── Anthropic ──────────────────────────────────────────
    ANTHROPIC_API_KEY: p.anthropic?.apiKey,
    ANTHROPIC_MODEL: p.anthropic?.model,

    // ── OpenAI ─────────────────────────────────────────────
    OPENAI_API_KEY: p.openai?.apiKey,

    // ── Proxy (OpenAI-compatible endpoint) ────────────────
    HARUBASHI_PROXY_BASE_URL: p.proxy?.baseURL,
    HARUBASHI_PROXY_API_KEY: p.proxy?.apiKey,
    HARUBASHI_PROXY_MODEL: p.proxy?.model,

    // ── Telegram ───────────────────────────────────────────
    TELEGRAM_BOT_TOKEN:
      profile.telegram?.enabled === false ? undefined : profile.telegram?.botToken,

    // ── Web Search ─────────────────────────────────────────
    TAVILY_API_KEY: profile.tavilyApiKey,

    // ── Command Guard ──────────────────────────────────────
    HARUBASHI_SAFE_COMMANDS: profile.commandGuard?.safeCommands?.join(','),
    HARUBASHI_COMMAND_TIMEOUT:
      profile.commandGuard?.timeoutMs !== undefined
        ? String(profile.commandGuard.timeoutMs)
        : undefined,
  };

  return flat;
}

/**
 * Load the YAML config and produce a flat key-value object suitable for
 * `ConfigModule.forRoot({ load: [...] })`. Side-effect: also injects
 * DATABASE_URL into `process.env` so external `prisma` invocations work.
 */
export function loadAndFlatten(): Record<string, string | undefined> {
  const config = loadHarubashiConfig();
  const flat = flattenForNestConfig(config);

  if (flat.DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = flat.DATABASE_URL;
  }

  return flat;
}

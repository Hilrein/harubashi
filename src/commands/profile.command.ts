import * as fs from 'fs';
import { confirm } from '@inquirer/prompts';
import { HarubashiPaths } from '../common/paths';
import {
  getActiveProfile,
  loadHarubashiConfig,
  saveHarubashiConfig,
} from '../config/config-loader';
import {
  HarubashiConfig,
  Profile,
  ProviderName,
} from '../config/config.types';
import {
  askModel,
  askProfileName,
  askProvider,
  askProviderCredentials,
  askSelectOrCreateProfile,
  askTelegram,
  askWebSearch,
  databaseExists,
  initializeDatabase,
  prettyProviderName,
  printStep,
  upsertDefaultUser,
} from './setup.helpers';

// ══════════════════════════════════════════════════════════
// ── profile list ─────────────────────────────────────────
// ══════════════════════════════════════════════════════════

export function runProfileList(): void {
  const config = loadHarubashiConfig();
  const names = Object.keys(config.profiles);

  if (names.length === 0) {
    console.log('\x1b[90m(no profiles)\x1b[0m');
    return;
  }

  const nameWidth = Math.max(7, ...names.map((n) => n.length));

  console.log();
  console.log('\x1b[36m── Profiles ────────────────────────────────────────\x1b[0m');
  for (const name of names) {
    const profile = config.profiles[name];
    const isActive = name === config.activeProfile;
    const padded = name.padEnd(nameWidth);
    const provider = profile.llmProvider;
    const model = providerModel(profile, provider) || '(no model)';
    const summary = `${provider} \x1b[90m·\x1b[0m ${model}`;
    const marker = isActive ? '  \x1b[32m✓ active\x1b[0m' : '';
    const nameColor = isActive ? '\x1b[32m' : '\x1b[36m';

    console.log(
      `  ${nameColor}${padded}\x1b[0m  \x1b[90m${summary}\x1b[0m${marker}`,
    );
  }
  console.log('\x1b[36m────────────────────────────────────────────────────\x1b[0m');
  console.log();
  console.log(`  Config: \x1b[90m${HarubashiPaths.configFile}\x1b[0m`);
  console.log();
}

function providerModel(profile: Profile, name: ProviderName): string | undefined {
  const block = profile.providers[name] as { model?: string } | undefined;
  return block?.model;
}

// ══════════════════════════════════════════════════════════
// ── profile use ──────────────────────────────────────────
// ══════════════════════════════════════════════════════════

export function runProfileUse(name: string): void {
  const config = loadHarubashiConfig();

  if (!config.profiles[name]) {
    console.error(`\x1b[31m[harubashi] Profile "${name}" does not exist.\x1b[0m`);
    console.error(
      `\x1b[33mAvailable: ${Object.keys(config.profiles).join(', ')}\x1b[0m`,
    );
    process.exit(1);
  }

  if (config.activeProfile === name) {
    console.log(
      `\x1b[90m[harubashi] "${name}" is already the active profile.\x1b[0m`,
    );
    return;
  }

  config.activeProfile = name;
  saveHarubashiConfig(config);

  console.log(`\x1b[32m✓\x1b[0m  Active profile is now \x1b[36m${name}\x1b[0m`);
}

// ══════════════════════════════════════════════════════════
// ── profile create ───────────────────────────────────────
// ══════════════════════════════════════════════════════════

/**
 * Hybrid create flow: every prompt is pre-filled with values from the
 * currently-active profile. Pressing Enter at every step yields a perfect
 * clone (with a fresh database). Changing any prompt produces an independent
 * profile.
 *
 * The profile is only persisted to `config.yaml` AFTER the database is
 * successfully initialized — failures cannot leave a half-created entry.
 */
export async function runProfileCreate(nameArg?: string): Promise<void> {
  const config = loadHarubashiConfig();
  const active = getActiveProfile(config);
  const existing = new Set(Object.keys(config.profiles));

  printHeader();

  // ── Step 1: Profile name ───────────────────────────────
  printStep(1, 'Profile name');
  const name = await askProfileName({
    name: nameArg && !existing.has(nameArg) ? nameArg : undefined,
    forbidden: existing,
  });

  // If a name arg was provided but it conflicted, askProfileName already
  // re-prompted with validation. By this point `name` is guaranteed unique.

  // ── Step 2: Provider (default = active) ───────────────
  printStep(2, 'LLM Provider');
  const providerName = await askProvider({ provider: active.llmProvider });

  // ── Step 3: Credentials (pre-fill only when same provider) ─
  printStep(3, 'Credentials');
  const credentialsDefaults =
    providerName === active.llmProvider ? active.providers : undefined;
  const providers = await askProviderCredentials(providerName, credentialsDefaults);

  // ── Step 4: Model (pre-fill only when same provider) ──
  printStep(4, 'Model');
  const modelDefault =
    providerName === active.llmProvider
      ? (active.providers[providerName] as { model?: string } | undefined)?.model
      : undefined;
  const model = await askModel(providerName, { model: modelDefault });
  attachModel(providers, providerName, model);

  // ── Step 5: Telegram (default = active) ───────────────
  printStep(5, 'Messaging');
  const telegram = await askTelegram(active.telegram);

  // ── Step 6: Web Search (default = active) ──────────────
  printStep(6, 'Web Search');
  const tavilyApiKey = await askWebSearch({ tavilyApiKey: active.tavilyApiKey });

  const newProfile: Profile = {
    llmProvider: providerName,
    providers,
    ...(telegram ? { telegram } : {}),
    ...(tavilyApiKey ? { tavilyApiKey } : {}),
  };

  // ── Step 7: Database (init BEFORE writing config) ─────
  printStep(7, 'Database');
  try {
    await initializeDatabase(name);
    await upsertDefaultUser(name);
  } catch (err) {
    console.error(
      `\x1b[31m✗\x1b[0m  Failed to initialize database: ${(err as Error).message}`,
    );
    console.error(
      '\x1b[90m   Profile NOT added to config.yaml. The .db file (if any) is left for inspection.\x1b[0m',
    );
    process.exit(1);
  }

  // ── Step 8: Persist ───────────────────────────────────
  config.profiles[name] = newProfile;
  saveHarubashiConfig(config);
  console.log(
    `  \x1b[32m✓\x1b[0m  Appended profile "${name}" to ${HarubashiPaths.configFile}`,
  );

  printFooter(name, providerName, config.activeProfile);
}

// ══════════════════════════════════════════════════════════
// ── profile edit ─────────────────────────────────────────
// ══════════════════════════════════════════════════════════

/**
 * Edit an existing profile. If `nameArg` is provided, the wizard runs
 * directly against that profile (errors out if it does not exist). If no
 * `nameArg` is given, the user picks via the same select prompt that
 * `setup` uses, with an escape hatch to dispatch to `runProfileCreate`.
 *
 * The database is **not** touched if the profile's `.db` file already
 * exists — editing is config-only and instant.
 */
export async function runProfileEdit(nameArg?: string): Promise<void> {
  const config = loadHarubashiConfig();

  let targetName: string;

  if (nameArg) {
    if (!config.profiles[nameArg]) {
      console.error(
        `\x1b[31m[harubashi] Profile "${nameArg}" does not exist.\x1b[0m`,
      );
      console.error(
        `\x1b[33mAvailable: ${Object.keys(config.profiles).join(', ')}\x1b[0m`,
      );
      process.exit(1);
    }
    targetName = nameArg;
  } else {
    const choice = await askSelectOrCreateProfile(config);
    if (choice.mode === 'create') {
      // Dispatch to the create flow (will prompt for a name).
      await runProfileCreate();
      return;
    }
    targetName = choice.name;
  }

  await runEditFlow(config, targetName);
}

/** The actual edit wizard for a known, validated profile name. */
async function runEditFlow(
  config: HarubashiConfig,
  name: string,
): Promise<void> {
  const existing = config.profiles[name];

  printEditHeader(name);

  // ── Step 1: Provider (default = current) ──────────────
  printStep(1, 'LLM Provider');
  const providerName = await askProvider({ provider: existing.llmProvider });

  // ── Step 2: Credentials (pre-fill only when provider unchanged) ─
  printStep(2, 'Credentials');
  const credentialsDefaults =
    providerName === existing.llmProvider ? existing.providers : undefined;
  const providers = await askProviderCredentials(
    providerName,
    credentialsDefaults,
  );

  // ── Step 3: Model (pre-fill only when provider unchanged) ─
  printStep(3, 'Model');
  const modelDefault =
    providerName === existing.llmProvider
      ? (existing.providers[providerName] as { model?: string } | undefined)
          ?.model
      : undefined;
  const model = await askModel(providerName, { model: modelDefault });
  attachModel(providers, providerName, model);

  // ── Step 4: Telegram (default = current) ──────────────
  printStep(4, 'Messaging');
  const telegram = await askTelegram(existing.telegram);

  // ── Step 5: Web Search (default = current) ─────────────
  printStep(5, 'Web Search');
  const tavilyApiKey = await askWebSearch({ tavilyApiKey: existing.tavilyApiKey });

  const updatedProfile: Profile = {
    llmProvider: providerName,
    providers,
    ...(telegram ? { telegram } : {}),
    ...(tavilyApiKey ? { tavilyApiKey } : {}),
  };

  // ── Step 6: Database (skipped if .db already exists) ──
  if (databaseExists(name)) {
    console.log(
      `\n\x1b[90m── Database ──────────────────────────────────\x1b[0m`,
    );
    console.log(
      `  \x1b[90m↪ ${HarubashiPaths.databaseFile(name)} already exists. Skipping init.\x1b[0m`,
    );
  } else {
    printStep(6, 'Database');
    try {
      await initializeDatabase(name);
      await upsertDefaultUser(name);
    } catch (err) {
      console.error(
        `\x1b[31m✗\x1b[0m  Failed to initialize database: ${(err as Error).message}`,
      );
      console.error(
        '\x1b[90m   Profile NOT updated in config.yaml.\x1b[0m',
      );
      process.exit(1);
    }
  }

  // ── Persist the updated profile ───────────────────────
  config.profiles[name] = updatedProfile;
  saveHarubashiConfig(config);
  console.log(
    `  \x1b[32m✓\x1b[0m  Updated profile "${name}" in ${HarubashiPaths.configFile}`,
  );

  printEditFooter(name, providerName, config.activeProfile);
}

// ══════════════════════════════════════════════════════════
// ── profile delete ───────────────────────────────────────
// ══════════════════════════════════════════════════════════

/**
 * Delete a profile completely:
 *  1. Refuse if `name` is the active profile (user must `profile use <other>` first).
 *  2. Show a confirmation prompt — destructive, irreversible.
 *  3. Remove `~/.harubashi/databases/<name>.db` (best-effort; warn if absent).
 *  4. Remove `profiles[name]` from `config.yaml` and persist.
 *
 * Refuses to delete the very last profile (config without profiles is
 * invalid for the daemon).
 */
export async function runProfileDelete(name: string): Promise<void> {
  const config = loadHarubashiConfig();

  // ── 1. Existence check ────────────────────────────────
  if (!config.profiles[name]) {
    console.error(
      `\x1b[31m[harubashi] Profile "${name}" does not exist.\x1b[0m`,
    );
    const available = Object.keys(config.profiles);
    if (available.length > 0) {
      console.error(
        `\x1b[33mAvailable: ${available.join(', ')}\x1b[0m`,
      );
    }
    process.exit(1);
  }

  // ── 2. Active-profile guard ───────────────────────────
  if (config.activeProfile === name) {
    const others = Object.keys(config.profiles).filter((p) => p !== name);
    console.error(
      `\x1b[31m[harubashi] Cannot delete "${name}": it is the active profile.\x1b[0m`,
    );
    if (others.length === 0) {
      console.error(
        `\x1b[33mIt is also the only profile. Re-run 'harubashi setup' to create another, then delete this one.\x1b[0m`,
      );
    } else {
      console.error(`\x1b[33mSwitch to another profile first:\x1b[0m`);
      for (const other of others) {
        console.error(`    \x1b[32m$\x1b[0m harubashi profile use ${other}`);
      }
    }
    process.exit(1);
  }

  // ── 3. Last-profile guard ─────────────────────────────
  if (Object.keys(config.profiles).length === 1) {
    console.error(
      `\x1b[31m[harubashi] Cannot delete "${name}": it is the only profile in config.\x1b[0m`,
    );
    console.error(
      `\x1b[33mDeleting it would leave Harubashi unusable. Create another profile first.\x1b[0m`,
    );
    process.exit(1);
  }

  // ── 4. Show what will happen ──────────────────────────
  const dbPath = HarubashiPaths.databaseFile(name);
  const dbExists = fs.existsSync(dbPath);

  console.log();
  console.log(`\x1b[33m── About to delete profile "${name}" ──────────────\x1b[0m`);
  console.log(`  Profile entry in: \x1b[90m${HarubashiPaths.configFile}\x1b[0m`);
  if (dbExists) {
    console.log(`  Database file:    \x1b[90m${dbPath}\x1b[0m`);
  } else {
    console.log(
      `  Database file:    \x1b[90m(none — ${dbPath} does not exist)\x1b[0m`,
    );
  }
  console.log(`\x1b[31m  This action cannot be undone.\x1b[0m`);
  console.log();

  // ── 5. Confirm ────────────────────────────────────────
  const ok = await confirm({
    message: `Permanently delete profile "${name}"?`,
    default: false,
  });

  if (!ok) {
    console.log(`\x1b[90m  Cancelled. Nothing was deleted.\x1b[0m`);
    return;
  }

  // ── 6. Delete the database file (best-effort) ─────────
  if (dbExists) {
    try {
      fs.unlinkSync(dbPath);
      console.log(`  \x1b[32m✓\x1b[0m  Removed ${dbPath}`);
    } catch (err) {
      console.error(
        `  \x1b[33m⚠\x1b[0m  Could not remove ${dbPath}: ${(err as Error).message}`,
      );
      console.error(
        `  \x1b[33m   Continuing — you may need to delete it manually.\x1b[0m`,
      );
    }
  }

  // ── 7. Remove from config and persist ─────────────────
  delete config.profiles[name];
  saveHarubashiConfig(config);
  console.log(`  \x1b[32m✓\x1b[0m  Removed "${name}" from ${HarubashiPaths.configFile}`);

  console.log();
  console.log(`\x1b[32m✓\x1b[0m  Profile "${name}" deleted.`);
  console.log(
    `\x1b[90m  Active profile remains: ${config.activeProfile}\x1b[0m`,
  );
  console.log();
}

// ══════════════════════════════════════════════════════════
// ── Internals ────────────────────────────────────────────
// ══════════════════════════════════════════════════════════

function attachModel(
  providers: Profile['providers'],
  name: ProviderName,
  model: string,
): void {
  const block = providers[name] as { model?: string } | undefined;
  if (block) {
    block.model = model;
  }
}

function printHeader(): void {
  console.log();
  console.log('\x1b[36m╔══════════════════════════════════════════════╗');
  console.log('║         Harubashi · Create Profile           ║');
  console.log('╚══════════════════════════════════════════════╝\x1b[0m');
  console.log(
    '\x1b[90m  Press Enter at each prompt to clone the active profile.\x1b[0m',
  );
}

function printEditHeader(name: string): void {
  const title = `Harubashi · Edit Profile "${name}"`;
  const pad = Math.max(0, 46 - title.length);
  const left = Math.floor(pad / 2);
  const right = pad - left;
  console.log();
  console.log('\x1b[36m╔══════════════════════════════════════════════╗');
  console.log(`║${' '.repeat(left)}${title}${' '.repeat(right)}║`);
  console.log('╚══════════════════════════════════════════════╝\x1b[0m');
  console.log(
    '\x1b[90m  Press Enter at each prompt to keep the current value.\x1b[0m',
  );
}

function printEditFooter(
  name: string,
  provider: ProviderName,
  activeProfile: string,
): void {
  const isActive = name === activeProfile;
  console.log();
  console.log('\x1b[32m╔══════════════════════════════════════════════╗');
  console.log('║          ✓  Profile updated!                 ║');
  console.log('╚══════════════════════════════════════════════╝\x1b[0m');
  console.log();
  console.log(`  Profile:        \x1b[36m${name}\x1b[0m`);
  console.log(`  Provider:       \x1b[36m${prettyProviderName(provider)}\x1b[0m`);
  if (isActive) {
    console.log(
      `  Active profile: \x1b[32m${activeProfile}\x1b[0m \x1b[90m(this one)\x1b[0m`,
    );
    console.log();
    console.log(
      '\x1b[90m  Restart any running daemon/cli to pick up the changes.\x1b[0m',
    );
  } else {
    console.log(
      `  Active profile: \x1b[90m${activeProfile}\x1b[0m \x1b[33m(unchanged)\x1b[0m`,
    );
    console.log();
    console.log('\x1b[90m  Switch to it with:\x1b[0m');
    console.log(`    \x1b[32m$\x1b[0m harubashi profile use ${name}`);
  }
  console.log();
}

function printFooter(
  name: string,
  provider: ProviderName,
  activeProfile: string,
): void {
  console.log();
  console.log('\x1b[32m╔══════════════════════════════════════════════╗');
  console.log('║          ✓  Profile created!                 ║');
  console.log('╚══════════════════════════════════════════════╝\x1b[0m');
  console.log();
  console.log(`  Profile:        \x1b[36m${name}\x1b[0m`);
  console.log(`  Provider:       \x1b[36m${prettyProviderName(provider)}\x1b[0m`);
  console.log(`  Active profile: \x1b[90m${activeProfile}\x1b[0m \x1b[33m(unchanged)\x1b[0m`);
  console.log();
  console.log('\x1b[90m  Switch to it with:\x1b[0m');
  console.log(`    \x1b[32m$\x1b[0m harubashi profile use ${name}`);
  console.log();
}

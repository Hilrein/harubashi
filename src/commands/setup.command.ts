import * as fs from 'fs';
import { HarubashiPaths } from '../common/paths';
import {
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
  copyBundledSkills,
  createDirectories,
  initializeDatabase,
  prettyProviderName,
  printStep,
  upsertDefaultUser,
} from './setup.helpers';

// ══════════════════════════════════════════════════════════
// ── Entry point ──────────────────────────────────────────
// ══════════════════════════════════════════════════════════

/**
 * `harubashi setup` — primary configuration entrypoint.
 *
 * - **No config yet** → run the first-time setup (creates `~/.harubashi/`,
 *   bootstraps directories, copies bundled skills, asks the full wizard,
 *   initializes the database, and sets the new profile as active).
 * - **Config already exists** → ask the user to either pick an existing
 *   profile to edit or create a new one. The actual create / edit logic
 *   lives in `profile.command.ts` and is dispatched lazily.
 */
export async function runSetup(): Promise<void> {
  if (fs.existsSync(HarubashiPaths.configFile)) {
    return runDispatcher();
  }
  return runFirstTimeSetup();
}

// ══════════════════════════════════════════════════════════
// ── Dispatcher (config exists) ───────────────────────────
// ══════════════════════════════════════════════════════════

async function runDispatcher(): Promise<void> {
  printDispatcherHeader();
  const config = loadHarubashiConfig();
  const choice = await askSelectOrCreateProfile(config);

  if (choice.mode === 'create') {
    const { runProfileCreate } = await import('./profile.command');
    await runProfileCreate();
    return;
  }

  const { runProfileEdit } = await import('./profile.command');
  await runProfileEdit(choice.name);
}

function printDispatcherHeader(): void {
  console.log();
  console.log('\x1b[36m╔══════════════════════════════════════════════╗');
  console.log('║            Harubashi Setup                   ║');
  console.log('╚══════════════════════════════════════════════╝\x1b[0m');
  console.log();
}

// ══════════════════════════════════════════════════════════
// ── First-time setup (no config) ─────────────────────────
// ══════════════════════════════════════════════════════════

async function runFirstTimeSetup(): Promise<void> {
  printFirstTimeHeader();

  // ── Step 1: Profile name ───────────────────────────────
  printStep(1, 'Profile');
  const profileName = await askProfileName();

  // ── Step 2: Provider ───────────────────────────────────
  printStep(2, 'LLM Provider');
  const providerName = await askProvider();

  // ── Step 3: Credentials ────────────────────────────────
  printStep(3, 'Credentials');
  const providers = await askProviderCredentials(providerName);

  // ── Step 4: Model ──────────────────────────────────────
  printStep(4, 'Model');
  const model = await askModel(providerName);
  attachModel(providers, providerName, model);

  // ── Step 5: Telegram (optional) ────────────────────────
  printStep(5, 'Messaging');
  const telegram = await askTelegram();

  // ── Step 6: Materialize ────────────────────────────────
  printStep(6, 'Creating ~/.harubashi/');
  createDirectories();
  copyBundledSkills();

  const profile: Profile = {
    llmProvider: providerName,
    providers,
    ...(telegram ? { telegram } : {}),
  };
  const config: HarubashiConfig = {
    activeProfile: profileName,
    profiles: { [profileName]: profile },
  };
  saveHarubashiConfig(config);
  console.log(`  \x1b[32m✓\x1b[0m  Wrote ${HarubashiPaths.configFile}`);

  // ── Step 7: Database ───────────────────────────────────
  printStep(7, 'Database');
  await initializeDatabase(profileName);
  await upsertDefaultUser(profileName);

  printFirstTimeFooter(profileName, providerName);
}

// ══════════════════════════════════════════════════════════
// ── Internals ────────────────────────────────────────────
// ══════════════════════════════════════════════════════════

/** Mutate the providers block to set `model` on the chosen provider. */
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

function printFirstTimeHeader(): void {
  console.log();
  console.log('\x1b[36m╔══════════════════════════════════════════════╗');
  console.log('║            Harubashi Setup                   ║');
  console.log('╚══════════════════════════════════════════════╝\x1b[0m');
  console.log('\x1b[90m  Welcome! Let\'s configure your first profile.\x1b[0m');
  console.log();
}

function printFirstTimeFooter(profile: string, provider: ProviderName): void {
  console.log();
  console.log('\x1b[32m╔══════════════════════════════════════════════╗');
  console.log('║              ✓  Setup complete!              ║');
  console.log('╚══════════════════════════════════════════════╝\x1b[0m');
  console.log();
  console.log(`  Profile:  \x1b[36m${profile}\x1b[0m`);
  console.log(`  Provider: \x1b[36m${prettyProviderName(provider)}\x1b[0m`);
  console.log(`  Config:   \x1b[90m${HarubashiPaths.configFile}\x1b[0m`);
  console.log();
  console.log('\x1b[90m  Next steps:\x1b[0m');
  console.log('    \x1b[32m$\x1b[0m harubashi cli      \x1b[90m# launch interactive REPL\x1b[0m');
  console.log('    \x1b[32m$\x1b[0m harubashi daemon   \x1b[90m# launch Telegram daemon\x1b[0m');
  console.log();
}

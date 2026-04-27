export type ProviderName =
  | 'google'
  | 'nvidia'
  | 'anthropic'
  | 'openai'
  | 'proxy';

export interface GoogleProviderConfig {
  apiKey?: string;
  model?: string;
}

export interface NvidiaProviderConfig {
  apiKey?: string;
  model?: string;
  baseURL?: string;
}

export interface AnthropicProviderConfig {
  apiKey?: string;
  model?: string;
}

export interface OpenAiProviderConfig {
  apiKey?: string;
  model?: string;
}

export interface ProxyProviderConfig {
  baseURL?: string;
  apiKey?: string;
  model?: string;
}

export interface ProvidersBlock {
  google?: GoogleProviderConfig;
  nvidia?: NvidiaProviderConfig;
  anthropic?: AnthropicProviderConfig;
  openai?: OpenAiProviderConfig;
  proxy?: ProxyProviderConfig;
}

export interface TelegramConfig {
  enabled?: boolean;
  botToken?: string;
}

export interface CommandGuardConfig {
  safeCommands?: string[];
  timeoutMs?: number;
}

export interface Profile {
  llmProvider: ProviderName;
  providers: ProvidersBlock;
  telegram?: TelegramConfig;
  commandGuard?: CommandGuardConfig;
}

export interface HarubashiConfig {
  activeProfile: string;
  profiles: Record<string, Profile>;
}

export class ConfigMissingError extends Error {
  constructor(public readonly configPath: string) {
    super(
      `Harubashi config not found at "${configPath}". ` +
        `Please run 'harubashi setup' first.`,
    );
    this.name = 'ConfigMissingError';
  }
}

export class ConfigInvalidError extends Error {
  constructor(message: string) {
    super(`Invalid Harubashi config: ${message}`);
    this.name = 'ConfigInvalidError';
  }
}

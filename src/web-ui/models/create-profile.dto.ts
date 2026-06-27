import {
  IsBoolean,
  IsArray,
  IsNumber,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

/**
 * Data transfer object for creating a new profile.
 */
export class CreateProfileDto {
  /** The profile name. Must only contain alphanumeric characters, underscores, or dashes. */
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9_-]+$/i, {
    message: 'Profile name must only contain alphanumeric characters, dashes, or underscores',
  })
  readonly name!: string;

  /** The chosen LLM provider. */
  @IsString()
  @IsNotEmpty()
  readonly provider!: 'google' | 'nvidia' | 'anthropic' | 'openai' | 'proxy';

  /** Optional API Key for the provider. */
  @IsString()
  @IsOptional()
  readonly apiKey?: string;

  /** The model identifier. */
  @IsString()
  @IsNotEmpty()
  readonly model!: string;

  /** The proxy base URL if provider is 'proxy'. */
  @IsString()
  @IsOptional()
  readonly proxyBaseUrl?: string;

  /** Flag to determine if Telegram integration should be active. */
  @IsBoolean()
  @IsOptional()
  readonly telegramEnabled?: boolean;

  /** Telegram bot token. */
  @IsString()
  @IsOptional()
  readonly telegramBotToken?: string;

  /** Guard timeout in milliseconds. */
  @IsNumber()
  @IsOptional()
  readonly commandTimeoutMs?: number;

  /** Allowed guard safe commands. */
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  readonly safeCommands?: string[];
}

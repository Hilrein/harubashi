import {
  IsBoolean,
  IsArray,
  IsNumber,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

/**
 * Data transfer object for updating the active profile's configuration.
 */
export class UpdateConfigDto {
  /** The chosen LLM provider. */
  @IsString()
  @IsNotEmpty()
  readonly provider!: 'google' | 'nvidia' | 'anthropic' | 'openai' | 'proxy';

  /** Optional API Key for the provider. If set to '***' or empty, the key is preserved. */
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

  /** Telegram bot token. If set to '***' or empty, the token is preserved. */
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

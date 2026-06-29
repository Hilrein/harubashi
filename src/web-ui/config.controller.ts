import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  loadHarubashiConfig,
  saveHarubashiConfig,
} from '../config/config-loader';
import { reloadConfigCache } from '../config/config-reload.helper';
import { UpdateConfigDto } from './models/update-config.dto';
import type { Profile, ProviderName } from '../config/config.types';

export interface ActiveConfigResponse {
  readonly provider: string;
  readonly model: string;
  readonly hasApiKey: boolean;
  readonly proxyBaseUrl?: string;
  readonly telegramEnabled: boolean;
  readonly hasTelegramBotToken: boolean;
}

@Controller('config')
export class ConfigController {
  constructor(private readonly configService: ConfigService) {}

  @Get()
  getActiveConfig(): ActiveConfigResponse {
    const config = loadHarubashiConfig();
    const active = config.profiles[config.activeProfile];
    const provider = active.llmProvider;
    const providerConfig = active.providers[provider] as
      | { apiKey?: string; model?: string; baseURL?: string }
      | undefined;

    return {
      provider,
      model: providerConfig?.model ?? '',
      hasApiKey: !!providerConfig?.apiKey,
      proxyBaseUrl: provider === 'proxy' ? providerConfig?.baseURL : undefined,
      telegramEnabled: active.telegram?.enabled ?? false,
      hasTelegramBotToken: !!active.telegram?.botToken,
    };
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  updateConfig(@Body() dto: UpdateConfigDto): { readonly success: boolean } {
    const config = loadHarubashiConfig();
    const active = config.profiles[config.activeProfile];
    const newProviderKey = dto.provider as ProviderName;

    // Check if new LLM provider config block exists, initialize if not
    if (!active.providers[newProviderKey]) {
      active.providers[newProviderKey] = {};
    }

    const targetProvider = active.providers[newProviderKey] as Record<string, any>;

    // Handle apiKey update logic (keeping old key if sent as '***')
    const oldProviderConfig = active.providers[active.llmProvider] as Record<string, any> | undefined;
    const oldApiKey = oldProviderConfig?.apiKey;

    let finalApiKey = dto.apiKey;
    if (dto.apiKey === '***') {
      finalApiKey = oldApiKey;
    }

    // Set provider details
    active.llmProvider = newProviderKey;
    targetProvider.model = dto.model;

    if (newProviderKey === 'proxy') {
      targetProvider.baseURL = dto.proxyBaseUrl || 'http://localhost:8080/v1';
    }

    if (finalApiKey) {
      targetProvider.apiKey = finalApiKey;
    } else if (dto.apiKey === undefined && oldApiKey && newProviderKey === active.llmProvider) {
      targetProvider.apiKey = oldApiKey; // Keep if same provider and not explicitly updated
    }

    // Handle Telegram settings
    if (dto.telegramEnabled) {
      let finalBotToken = dto.telegramBotToken;
      if (dto.telegramBotToken === '***') {
        finalBotToken = active.telegram?.botToken;
      }
      active.telegram = {
        enabled: true,
        botToken: finalBotToken,
      };
    } else {
      active.telegram = {
        enabled: false,
        botToken: undefined,
      };
    }

    // Handle command guards
    if (dto.commandTimeoutMs !== undefined || dto.safeCommands) {
      active.commandGuard = {
        ...(dto.safeCommands ? { safeCommands: dto.safeCommands } : {}),
        ...(dto.commandTimeoutMs ? { timeoutMs: dto.commandTimeoutMs } : {}),
      };
    }

    saveHarubashiConfig(config);

    // Dynamic configuration hot-reload trigger
    reloadConfigCache(this.configService);

    return { success: true };
  }
}

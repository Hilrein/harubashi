import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  loadHarubashiConfig,
  saveHarubashiConfig,
} from '../config/config-loader';
import {
  databaseExists,
  initializeDatabase,
  upsertDefaultUser,
} from '../commands/setup.helpers';
import { reloadConfigCache } from '../config/config-reload.helper';
import { CreateProfileDto } from './models/create-profile.dto';
import type { Profile, ProviderName } from '../config/config.types';

export interface ProfileListItem {
  readonly name: string;
  readonly provider: string;
  readonly model: string;
  readonly dbStatus: 'exists' | 'missing';
  readonly isActive: boolean;
}

@Controller('profiles')
export class ProfilesController {
  constructor(private readonly configService: ConfigService) {}

  @Get()
  getProfiles(): ProfileListItem[] {
    const config = loadHarubashiConfig();
    return Object.entries(config.profiles).map(([name, profile]) => {
      const provider = profile.llmProvider;
      const providerConfig = profile.providers[provider] as
        | { model?: string }
        | undefined;
      const model = providerConfig?.model ?? 'unknown';

      return {
        name,
        provider,
        model,
        dbStatus: databaseExists(name) ? 'exists' : 'missing',
        isActive: name === config.activeProfile,
      };
    });
  }

  @Post('use')
  @HttpCode(HttpStatus.OK)
  useProfile(@Body() body: { readonly name: string }): { readonly success: boolean } {
    if (!body.name) {
      throw new BadRequestException('Profile name is required');
    }

    const config = loadHarubashiConfig();
    if (!config.profiles[body.name]) {
      throw new NotFoundException(`Profile "${body.name}" does not exist`);
    }

    config.activeProfile = body.name;
    saveHarubashiConfig(config);

    // Dynamic configuration hot-reload
    reloadConfigCache(this.configService);

    return { success: true };
  }

  @Post()
  async createProfile(
    @Body() dto: CreateProfileDto,
  ): Promise<{ readonly name: string; readonly success: boolean }> {
    const config = loadHarubashiConfig();
    const name = dto.name.trim();

    if (config.profiles[name]) {
      throw new ConflictException(`Profile "${name}" already exists`);
    }

    // Prepare credentials blocks
    const providers: Profile['providers'] = {};
    const providerKey = dto.provider as ProviderName;

    if (dto.provider === 'proxy') {
      providers.proxy = {
        baseURL: dto.proxyBaseUrl || 'http://localhost:8080/v1',
        apiKey: dto.apiKey,
        model: dto.model,
      };
    } else {
      providers[providerKey] = {
        apiKey: dto.apiKey,
        model: dto.model,
      };
    }

    const newProfile: Profile = {
      llmProvider: providerKey,
      providers,
      ...(dto.telegramEnabled
        ? {
            telegram: {
              enabled: true,
              botToken: dto.telegramBotToken,
            },
          }
        : {}),
      ...(dto.safeCommands || dto.commandTimeoutMs
        ? {
            commandGuard: {
              ...(dto.safeCommands ? { safeCommands: dto.safeCommands } : {}),
              ...(dto.commandTimeoutMs ? { timeoutMs: dto.commandTimeoutMs } : {}),
            },
          }
        : {}),
    };

    // Initialize the SQLite database and upsert the default user
    try {
      await initializeDatabase(name);
      await upsertDefaultUser(name);
    } catch (err) {
      throw new BadRequestException(
        `Failed to initialize database for profile "${name}": ${(err as Error).message}`,
      );
    }

    // Persist profile to config.yaml
    config.profiles[name] = newProfile;
    saveHarubashiConfig(config);

    return { name, success: true };
  }
}

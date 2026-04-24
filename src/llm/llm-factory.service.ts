import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ILlmProvider } from './llm.interface';
import { AnthropicProvider } from './anthropic/anthropic.provider';
import { OpenAiProvider } from './openai/openai.provider';
import { GoogleOAuthProvider } from './google/google-oauth.provider';
import { ProxyProvider } from './proxy/proxy.provider';
import { NvidiaProvider } from './nvidia/nvidia.provider';

type ProviderName = 'anthropic' | 'openai' | 'google' | 'proxy' | 'nvidia';

@Injectable()
export class LlmFactoryService implements OnModuleInit {
  private readonly logger = new Logger(LlmFactoryService.name);
  private activeProvider: ILlmProvider;
  private activeProviderName: ProviderName;

  constructor(
    private readonly configService: ConfigService,
    private readonly anthropicProvider: AnthropicProvider,
    private readonly openAiProvider: OpenAiProvider,
    private readonly googleProvider: GoogleOAuthProvider,
    private readonly proxyProvider: ProxyProvider,
    private readonly nvidiaProvider: NvidiaProvider,
  ) {}

  onModuleInit() {
    const name = this.configService.get<string>(
      'HARUBASHI_LLM_PROVIDER',
    ) as ProviderName;

    this.activeProviderName = name;
    this.activeProvider = this.resolveProvider(name);
    this.logger.log(`Active LLM provider: ${name}`);
  }

  getProvider(): ILlmProvider {
    return this.activeProvider;
  }

  getProviderName(): string {
    return this.activeProviderName;
  }

  private resolveProvider(name: ProviderName): ILlmProvider {
    const map: Record<ProviderName, ILlmProvider> = {
      anthropic: this.anthropicProvider,
      openai: this.openAiProvider,
      google: this.googleProvider,
      proxy: this.proxyProvider,
      nvidia: this.nvidiaProvider,
    };

    const provider = map[name];
    if (!provider) {
      throw new Error(
        `Unknown LLM provider "${name}". Valid: ${Object.keys(map).join(', ')}`,
      );
    }
    return provider;
  }
}

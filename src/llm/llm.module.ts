import { Global, Module } from '@nestjs/common';
import { LlmFactoryService } from './llm-factory.service';
import { AnthropicProvider } from './anthropic/anthropic.provider';
import { OpenAiProvider } from './openai/openai.provider';
import { GoogleOAuthProvider } from './google/google-oauth.provider';
import { ProxyProvider } from './proxy/proxy.provider';
import { NvidiaProvider } from './nvidia/nvidia.provider';

@Global()
@Module({
  providers: [
    AnthropicProvider,
    OpenAiProvider,
    GoogleOAuthProvider,
    ProxyProvider,
    NvidiaProvider,
    LlmFactoryService,
  ],
  exports: [LlmFactoryService],
})
export class LlmModule {}

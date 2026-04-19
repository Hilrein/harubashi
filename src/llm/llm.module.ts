import { Global, Module } from '@nestjs/common';
import { LlmFactoryService } from './llm-factory.service';
import { AnthropicProvider } from './anthropic/anthropic.provider';
import { OpenAiProvider } from './openai/openai.provider';
import { GoogleOAuthProvider } from './google/google-oauth.provider';
import { ProxyProvider } from './proxy/proxy.provider';

@Global()
@Module({
  providers: [
    AnthropicProvider,
    OpenAiProvider,
    GoogleOAuthProvider,
    ProxyProvider,
    LlmFactoryService,
  ],
  exports: [LlmFactoryService],
})
export class LlmModule {}

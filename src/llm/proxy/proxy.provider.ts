import { Injectable, Logger, NotImplementedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ILlmProvider,
  LlmMessage,
  LlmResponse,
} from '../llm.interface';
import { ToolDefinition } from '../../common/types/tool.types';

/**
 * Proxy provider for OpenAI-compatible API endpoints.
 * Supports custom base URLs (e.g. local LLM servers, LiteLLM, etc.)
 *
 * Required env vars:
 *   HARUBASHI_PROXY_BASE_URL
 *   HARUBASHI_PROXY_MODEL
 *   HARUBASHI_PROXY_API_KEY (optional)
 */
@Injectable()
export class ProxyProvider implements ILlmProvider {
  private readonly logger = new Logger(ProxyProvider.name);

  constructor(private readonly configService: ConfigService) {
    const baseUrl = this.configService.get<string>('HARUBASHI_PROXY_BASE_URL');
    if (!baseUrl) {
      this.logger.warn('HARUBASHI_PROXY_BASE_URL is not set.');
    }
  }

  async generateResponse(
    _systemPrompt: string,
    _messages: LlmMessage[],
    _tools: ToolDefinition[],
    _signal?: AbortSignal,
  ): Promise<LlmResponse> {
    // TODO: Implement using `openai` SDK with custom baseURL
    throw new NotImplementedException(
      'ProxyProvider.generateResponse() will be implemented later',
    );
  }
}

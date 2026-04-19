import { Injectable, Logger, NotImplementedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ILlmProvider,
  LlmMessage,
  LlmResponse,
} from '../llm.interface';
import { ToolDefinition } from '../../common/types/tool.types';

@Injectable()
export class OpenAiProvider implements ILlmProvider {
  private readonly logger = new Logger(OpenAiProvider.name);

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      this.logger.warn('OPENAI_API_KEY is not set.');
    }
  }

  async generateResponse(
    _systemPrompt: string,
    _messages: LlmMessage[],
    _tools: ToolDefinition[],
    _signal?: AbortSignal,
  ): Promise<LlmResponse> {
    // TODO: Full implementation using `openai` SDK — Responses API with function tools
    throw new NotImplementedException(
      'OpenAiProvider.generateResponse() will be implemented later',
    );
  }
}

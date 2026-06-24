import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
  ILlmProvider,
  LlmMessage,
  LlmResponse,
} from '../llm.interface';
import { ToolDefinition } from '../../common/types/tool.types';
import { generateViaOpenAiCompatible } from '../openai-compatible/openai-compatible.helper';

/**
 * NVIDIA NIM provider (build.nvidia.com / integrate.api.nvidia.com).
 *
 * NVIDIA exposes an OpenAI-compatible Chat Completions API with function
 * tool calling. We reuse the shared OpenAI-compatible helper and only
 * override baseURL + defaults.
 *
 * Required env vars:
 *   NVIDIA_API_KEY           — API key (starts with "nvapi-...")
 *
 * Optional env vars:
 *   NVIDIA_MODEL             — model id, e.g. "meta/llama-3.3-70b-instruct"
 *   NVIDIA_BASE_URL          — override default endpoint
 */

const DEFAULT_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const DEFAULT_MODEL = 'meta/llama-3.3-70b-instruct';

@Injectable()
export class NvidiaProvider implements ILlmProvider {
  private readonly logger = new Logger(NvidiaProvider.name);
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('NVIDIA_API_KEY');
    const baseURL =
      this.configService.get<string>('NVIDIA_BASE_URL') || DEFAULT_BASE_URL;
    this.model =
      this.configService.get<string>('NVIDIA_MODEL') || DEFAULT_MODEL;

    if (!apiKey) {
      this.logger.warn('NVIDIA_API_KEY is not set.');
    }

    this.client = new OpenAI({
      apiKey: apiKey || 'missing-key',
      baseURL,
    });

    this.logger.log(
      `NvidiaProvider initialized (baseURL=${baseURL}, model=${this.model})`,
    );
  }

  generateResponse(
    systemPrompt: string,
    messages: LlmMessage[],
    tools: ToolDefinition[],
    signal?: AbortSignal,
  ): Promise<LlmResponse> {
    return generateViaOpenAiCompatible(
      this.client,
      this.model,
      systemPrompt,
      messages,
      tools,
      signal,
    );
  }
}

import { ContentBlock } from '../common/types/message.types';
import { ToolDefinition } from '../common/types/tool.types';

export interface LlmMessage {
  role: 'user' | 'assistant';
  content: ContentBlock[];
}

export interface LlmTokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface LlmResponse {
  contentBlocks: ContentBlock[];
  tokenUsage: LlmTokenUsage;
}

export interface ILlmProvider {
  generateResponse(
    systemPrompt: string,
    messages: LlmMessage[],
    tools: ToolDefinition[],
    signal?: AbortSignal,
  ): Promise<LlmResponse>;
}

export const LLM_PROVIDER = Symbol('LLM_PROVIDER');

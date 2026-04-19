import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import {
  ILlmProvider,
  LlmMessage,
  LlmResponse,
} from '../llm.interface';
import {
  ContentBlock,
  ContentBlockType,
  TextBlock,
  ToolUseBlock,
  ToolResultBlock,
  ThinkingBlock,
  RedactedThinkingBlock,
  ImageBlock,
} from '../../common/types/message.types';
import { ToolDefinition } from '../../common/types/tool.types';

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 16384;

@Injectable()
export class AnthropicProvider implements ILlmProvider {
  private readonly client: Anthropic;
  private readonly logger = new Logger(AnthropicProvider.name);
  private readonly model: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    this.model =
      this.configService.get<string>('ANTHROPIC_MODEL') || DEFAULT_MODEL;

    if (!apiKey) {
      this.logger.warn('ANTHROPIC_API_KEY is not set.');
    }

    this.client = new Anthropic({
      apiKey: apiKey || 'missing-key',
    });
  }

  async generateResponse(
    systemPrompt: string,
    messages: LlmMessage[],
    tools: ToolDefinition[],
    signal?: AbortSignal,
  ): Promise<LlmResponse> {
    const anthropicMessages = this.formatMessages(messages);
    const anthropicTools = this.formatTools(tools);

    const response = await this.client.messages.create(
      {
        model: this.model,
        max_tokens: MAX_TOKENS,
        system: [
          {
            type: 'text',
            text: systemPrompt,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: anthropicMessages,
        tools: anthropicTools.length > 0 ? anthropicTools : undefined,
      },
      { signal },
    );

    return {
      contentBlocks: this.parseResponse(response.content),
      tokenUsage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens:
          response.usage.input_tokens + response.usage.output_tokens,
      },
    };
  }

  // ── Format outgoing messages ────────────────────────────

  private formatMessages(
    messages: LlmMessage[],
  ): Anthropic.MessageParam[] {
    return messages.map((msg) => ({
      role: msg.role,
      content: msg.content.map((block) =>
        this.contentBlockToAnthropic(block),
      ),
    }));
  }

  private contentBlockToAnthropic(
    block: ContentBlock,
  ): Anthropic.ContentBlockParam {
    switch (block.type) {
      case ContentBlockType.Text:
        return { type: 'text', text: (block as TextBlock).text };

      case ContentBlockType.Image: {
        const img = block as ImageBlock;
        return {
          type: 'image',
          source: {
            type: 'base64',
            media_type: img.source.media_type as
              | 'image/png'
              | 'image/jpeg'
              | 'image/gif'
              | 'image/webp',
            data: img.source.data,
          },
        };
      }

      case ContentBlockType.ToolUse: {
        const tu = block as ToolUseBlock;
        return {
          type: 'tool_use',
          id: tu.id,
          name: tu.name,
          input: tu.input,
        };
      }

      case ContentBlockType.ToolResult: {
        const tr = block as ToolResultBlock;
        return {
          type: 'tool_result',
          tool_use_id: tr.tool_use_id,
          content: tr.content.map((c) => this.contentBlockToAnthropic(c)),
          is_error: tr.is_error,
        } as Anthropic.ToolResultBlockParam;
      }

      case ContentBlockType.Thinking: {
        const th = block as ThinkingBlock;
        return {
          type: 'thinking',
          thinking: th.thinking,
          signature: th.signature,
        } as unknown as Anthropic.ContentBlockParam;
      }

      case ContentBlockType.RedactedThinking: {
        const rd = block as RedactedThinkingBlock;
        return {
          type: 'redacted_thinking',
          data: rd.data,
        } as unknown as Anthropic.ContentBlockParam;
      }

      default:
        return { type: 'text', text: JSON.stringify(block) };
    }
  }

  // ── Format tools ────────────────────────────────────────

  private formatTools(tools: ToolDefinition[]): Anthropic.Tool[] {
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema as Anthropic.Tool.InputSchema,
    }));
  }

  // ── Parse incoming response ─────────────────────────────

  private parseResponse(
    content: Anthropic.ContentBlock[],
  ): ContentBlock[] {
    return content.map((block): ContentBlock => {
      switch (block.type) {
        case 'text':
          return {
            type: ContentBlockType.Text,
            text: block.text,
          } as TextBlock;

        case 'tool_use':
          return {
            type: ContentBlockType.ToolUse,
            id: block.id,
            name: block.name,
            input: block.input as Record<string, unknown>,
          } as ToolUseBlock;

        case 'thinking':
          return {
            type: ContentBlockType.Thinking,
            thinking: (block as any).thinking,
            signature: (block as any).signature,
          } as ThinkingBlock;

        default:
          return {
            type: ContentBlockType.Text,
            text: JSON.stringify(block),
          } as TextBlock;
      }
    });
  }
}

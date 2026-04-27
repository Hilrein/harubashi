import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ILlmProvider,
  LlmMessage,
  LlmResponse,
} from '../llm.interface';
import { ToolDefinition } from '../../common/types/tool.types';
import {
  ContentBlock,
  ContentBlockType,
  TextBlock,
  ToolUseBlock,
  ToolResultBlock,
} from '../../common/types/message.types';

/**
 * Google Gemini provider authenticated with a Google AI Studio API key.
 *
 * Required config:
 *   profiles.<active>.providers.google.apiKey   (mapped to GOOGLE_API_KEY)
 *   profiles.<active>.providers.google.model    (optional, mapped to GOOGLE_GEMINI_MODEL)
 */

const DEFAULT_MODEL = 'gemini-3-flash-preview';
const GEMINI_BASE_URL =
  'https://generativelanguage.googleapis.com/v1beta/models';

// ── Gemini REST API types ─────────────────────────────────

interface GeminiTextPart {
  text: string;
}
interface GeminiFunctionCallPart {
  functionCall: { name: string; args: Record<string, unknown> };
}
interface GeminiFunctionResponsePart {
  functionResponse: { name: string; response: Record<string, unknown> };
}
interface GeminiInlineDataPart {
  inlineData: { mimeType: string; data: string };
}
type GeminiPart =
  | GeminiTextPart
  | GeminiFunctionCallPart
  | GeminiFunctionResponsePart
  | GeminiInlineDataPart;

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface GeminiRequestBody {
  contents: GeminiContent[];
  systemInstruction?: { parts: [{ text: string }] };
  tools?: [{ functionDeclarations: GeminiFunctionDeclaration[] }];
}

interface GeminiResponse {
  candidates?: Array<{
    content?: GeminiContent;
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  error?: { code: number; message: string; status: string };
}

@Injectable()
export class GoogleProvider implements ILlmProvider {
  private readonly logger = new Logger(GoogleProvider.name);
  private readonly apiKey: string | undefined;
  private readonly model: string;

  constructor(configService: ConfigService) {
    this.apiKey = configService.get<string>('GOOGLE_API_KEY');
    this.model =
      configService.get<string>('GOOGLE_GEMINI_MODEL') || DEFAULT_MODEL;

    if (!this.apiKey) {
      this.logger.warn('GOOGLE_API_KEY is not set.');
    } else {
      this.logger.log(`GoogleProvider initialized for model "${this.model}"`);
    }
  }

  async generateResponse(
    systemPrompt: string,
    messages: LlmMessage[],
    tools: ToolDefinition[],
    signal?: AbortSignal,
  ): Promise<LlmResponse> {
    if (!this.apiKey) {
      throw new Error(
        'GoogleProvider is not configured. Set providers.google.apiKey in ~/.harubashi/config.yaml.',
      );
    }

    const body = this.buildRequestBody(systemPrompt, messages, tools);
    const url = `${GEMINI_BASE_URL}/${this.model}:generateContent`;

    this.logger.debug(
      `→ POST ${url} (${body.contents.length} msgs, ${tools.length} tools)`,
    );

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'x-goog-api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(
        `Gemini API error ${response.status}: ${errText.slice(0, 500)}`,
      );
    }

    const data = (await response.json()) as GeminiResponse;

    if (data.error) {
      throw new Error(
        `Gemini API error: ${data.error.code} ${data.error.status} — ${data.error.message}`,
      );
    }

    return this.parseResponse(data);
  }

  // ══════════════════════════════════════════════════════════
  // ── Outgoing: LlmMessage[] → Gemini request ──────────────
  // ══════════════════════════════════════════════════════════

  private buildRequestBody(
    systemPrompt: string,
    messages: LlmMessage[],
    tools: ToolDefinition[],
  ): GeminiRequestBody {
    // Index ToolUseBlock IDs → tool names for functionResponse mapping.
    const toolUseIdToName = new Map<string, string>();
    for (const msg of messages) {
      for (const block of msg.content) {
        if (block.type === ContentBlockType.ToolUse) {
          const tu = block as ToolUseBlock;
          toolUseIdToName.set(tu.id, tu.name);
        }
      }
    }

    const contents: GeminiContent[] = messages.map((msg) =>
      this.convertMessage(msg, toolUseIdToName),
    );

    const body: GeminiRequestBody = { contents };

    if (systemPrompt?.trim()) {
      body.systemInstruction = { parts: [{ text: systemPrompt }] };
    }

    if (tools.length > 0) {
      body.tools = [
        {
          functionDeclarations: tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: {
              type: t.input_schema.type,
              properties: t.input_schema.properties,
              required: t.input_schema.required,
            },
          })),
        },
      ];
    }

    return body;
  }

  private convertMessage(
    msg: LlmMessage,
    toolUseIdToName: Map<string, string>,
  ): GeminiContent {
    const parts: GeminiPart[] = [];

    for (const block of msg.content) {
      const part = this.convertBlock(block, toolUseIdToName);
      if (part) parts.push(part);
    }

    return {
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: parts.length > 0 ? parts : [{ text: '' }],
    };
  }

  private convertBlock(
    block: ContentBlock,
    toolUseIdToName: Map<string, string>,
  ): GeminiPart | null {
    switch (block.type) {
      case ContentBlockType.Text:
        return { text: (block as TextBlock).text };

      case ContentBlockType.ToolUse: {
        const tu = block as ToolUseBlock;
        return {
          functionCall: { name: tu.name, args: tu.input },
        };
      }

      case ContentBlockType.ToolResult: {
        const tr = block as ToolResultBlock;
        const name = toolUseIdToName.get(tr.tool_use_id) || 'unknown_tool';
        const flatText = tr.content
          .filter((c) => c.type === ContentBlockType.Text)
          .map((c) => (c as TextBlock).text)
          .join('\n');

        return {
          functionResponse: {
            name,
            response: tr.is_error ? { error: flatText } : { output: flatText },
          },
        };
      }

      case ContentBlockType.Image: {
        const img = block as { source: { media_type: string; data: string } };
        return {
          inlineData: {
            mimeType: img.source.media_type,
            data: img.source.data,
          },
        };
      }

      // Thinking blocks have no Gemini equivalent.
      case ContentBlockType.Thinking:
      case ContentBlockType.RedactedThinking:
      default:
        return null;
    }
  }

  // ══════════════════════════════════════════════════════════
  // ── Incoming: Gemini response → ContentBlock[] ───────────
  // ══════════════════════════════════════════════════════════

  private parseResponse(data: GeminiResponse): LlmResponse {
    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    const blocks: ContentBlock[] = [];
    let callCounter = 0;

    for (const part of parts) {
      if ('text' in part && part.text) {
        blocks.push({
          type: ContentBlockType.Text,
          text: part.text,
        } as TextBlock);
      } else if ('functionCall' in part && part.functionCall) {
        callCounter++;
        blocks.push({
          type: ContentBlockType.ToolUse,
          // Gemini does not return IDs for function calls — synthesize one.
          id: `gemini_${part.functionCall.name}_${callCounter}_${Date.now()}`,
          name: part.functionCall.name,
          input: part.functionCall.args || {},
        } as ToolUseBlock);
      }
    }

    if (blocks.length === 0) {
      blocks.push({
        type: ContentBlockType.Text,
        text: candidate?.finishReason
          ? `(empty response, finishReason: ${candidate.finishReason})`
          : '(empty response)',
      } as TextBlock);
    }

    const usage = data.usageMetadata || {};
    return {
      contentBlocks: blocks,
      tokenUsage: {
        inputTokens: usage.promptTokenCount || 0,
        outputTokens: usage.candidatesTokenCount || 0,
        totalTokens: usage.totalTokenCount || 0,
      },
    };
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
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
 * Google Gemini provider using OAuth 2.0 for authentication.
 *
 * Authenticates via OAuth 2.0 (client_id + client_secret + refresh_token)
 * to leverage the user's personal Google account quota instead of a paid API key.
 *
 * Required env vars:
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   GOOGLE_REFRESH_TOKEN
 *   GOOGLE_GEMINI_MODEL (optional, defaults to gemini-3-flash-preview)
 */

const DEFAULT_MODEL = 'gemini-3-flash-preview';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

// ── Gemini REST API types ─────────────────────────────────

interface GeminiTextPart {
  text: string;
  thoughtSignature?: string;
}
interface GeminiFunctionCallPart {
  functionCall: {
    name: string;
    args: Record<string, unknown>;
  };
  thoughtSignature?: string;
}
interface GeminiFunctionResponsePart {
  functionResponse: {
    name: string;
    response: Record<string, unknown>;
  };
}
interface GeminiInlineDataPart {
  inlineData: {
    mimeType: string;
    data: string;
  };
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
export class GoogleOAuthProvider implements ILlmProvider {
  private readonly logger = new Logger(GoogleOAuthProvider.name);
  private readonly oauthClient: OAuth2Client | null;
  private readonly model: string;
  private readonly hasCredentials: boolean;

  constructor(private readonly configService: ConfigService) {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');
    const refreshToken = this.configService.get<string>('GOOGLE_REFRESH_TOKEN');
    this.model =
      this.configService.get<string>('GOOGLE_GEMINI_MODEL') || DEFAULT_MODEL;

    this.hasCredentials = !!(clientId && clientSecret && refreshToken);

    if (!this.hasCredentials) {
      this.logger.warn(
        'Google OAuth credentials (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN) are not fully set.',
      );
      this.oauthClient = null;
      return;
    }

    this.oauthClient = new OAuth2Client({
      clientId,
      clientSecret,
    });
    this.oauthClient.setCredentials({ refresh_token: refreshToken });

    this.logger.log(`GoogleOAuthProvider initialized for model "${this.model}"`);
  }

  async generateResponse(
    systemPrompt: string,
    messages: LlmMessage[],
    tools: ToolDefinition[],
    signal?: AbortSignal,
  ): Promise<LlmResponse> {
    if (!this.oauthClient) {
      throw new Error(
        'GoogleOAuthProvider is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN.',
      );
    }

    const accessToken = await this.getAccessToken();
    const body = this.buildRequestBody(systemPrompt, messages, tools);
    const url = `${GEMINI_BASE_URL}/${this.model}:generateContent`;

    this.logger.debug(
      `→ POST ${url} (${body.contents.length} msgs, ${tools.length} tools)`,
    );

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
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
  // ── OAuth ────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════

  private async getAccessToken(): Promise<string> {
    if (!this.oauthClient) {
      throw new Error('OAuth client not initialized');
    }

    const { token } = await this.oauthClient.getAccessToken();

    if (!token) {
      throw new Error(
        'Failed to obtain access token from Google OAuth. ' +
          'Verify GOOGLE_REFRESH_TOKEN is valid and has the required scopes.',
      );
    }

    return token;
  }

  // ══════════════════════════════════════════════════════════
  // ── Outgoing: LlmMessage[] → Gemini request ──────────────
  // ══════════════════════════════════════════════════════════

  private buildRequestBody(
    systemPrompt: string,
    messages: LlmMessage[],
    tools: ToolDefinition[],
  ): GeminiRequestBody {
    // Index ToolUseBlock IDs → tool names so we can rebuild
    // Gemini's `functionResponse.name` from our `tool_use_id`.
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
      body.systemInstruction = {
        parts: [{ text: systemPrompt }],
      };
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
      case ContentBlockType.Text: {
        const tb = block as TextBlock;
        const part: GeminiTextPart = { text: tb.text };
        if (tb.thoughtSignature) part.thoughtSignature = tb.thoughtSignature;
        return part;
      }

      case ContentBlockType.ToolUse: {
        const tu = block as ToolUseBlock;
        const part: GeminiFunctionCallPart = {
          functionCall: {
            name: tu.name,
            args: tu.input,
          },
        };
        if (tu.thoughtSignature) part.thoughtSignature = tu.thoughtSignature;
        return part;
      }

      case ContentBlockType.ToolResult: {
        const tr = block as ToolResultBlock;
        const name = toolUseIdToName.get(tr.tool_use_id) || 'unknown_tool';

        // Gemini expects `response` to be an object — wrap text output
        const flatText = tr.content
          .filter((c) => c.type === ContentBlockType.Text)
          .map((c) => (c as TextBlock).text)
          .join('\n');

        return {
          functionResponse: {
            name,
            response: tr.is_error
              ? { error: flatText }
              : { output: flatText },
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

      // Thinking blocks have no Gemini equivalent — skip them
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
        const textBlock: TextBlock = {
          type: ContentBlockType.Text,
          text: part.text,
        };
        if (part.thoughtSignature) {
          textBlock.thoughtSignature = part.thoughtSignature;
        }
        blocks.push(textBlock);
      } else if ('functionCall' in part && part.functionCall) {
        callCounter++;
        const toolBlock: ToolUseBlock = {
          type: ContentBlockType.ToolUse,
          // Gemini does not return IDs for function calls — synthesize one.
          // Embedding the tool name keeps lookups robust on the next turn.
          id: `gemini_${part.functionCall.name}_${callCounter}_${Date.now()}`,
          name: part.functionCall.name,
          input: part.functionCall.args || {},
        };
        if (part.thoughtSignature) {
          toolBlock.thoughtSignature = part.thoughtSignature;
        }
        blocks.push(toolBlock);
      }
    }

    if (blocks.length === 0) {
      // Defensive fallback — never return an empty response
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

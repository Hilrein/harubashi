import OpenAI from 'openai';
import { LlmMessage, LlmResponse } from '../llm.interface';
import {
  ContentBlock,
  ContentBlockType,
  TextBlock,
  ImageBlock,
  ToolUseBlock,
  ToolResultBlock,
} from '../../common/types/message.types';
import { ToolDefinition } from '../../common/types/tool.types';

/**
 * Shared implementation for any OpenAI-compatible Chat Completions endpoint
 * (OpenAI, NVIDIA NIM, LiteLLM, local llama.cpp servers, OpenRouter, etc.).
 *
 * Converts Harubashi's internal ContentBlock[] representation to OpenAI
 * chat.completions messages + function tools, and parses the response back.
 */

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;
type ChatTool = OpenAI.Chat.Completions.ChatCompletionTool;
type ChatContentPart = OpenAI.Chat.Completions.ChatCompletionContentPart;
type AssistantMessageParam =
  OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam;

export async function generateViaOpenAiCompatible(
  client: OpenAI,
  model: string,
  systemPrompt: string,
  messages: LlmMessage[],
  tools: ToolDefinition[],
  signal?: AbortSignal,
): Promise<LlmResponse> {
  const chatMessages = buildChatMessages(systemPrompt, messages);
  const chatTools = buildTools(tools);

  const response = await client.chat.completions.create(
    {
      model,
      messages: chatMessages,
      tools: chatTools.length > 0 ? chatTools : undefined,
    },
    { signal },
  );

  const choice = response.choices[0];
  const contentBlocks = choice
    ? parseMessage(choice.message)
    : [{ type: ContentBlockType.Text, text: '' } as TextBlock];

  return {
    contentBlocks,
    tokenUsage: {
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
      totalTokens: response.usage?.total_tokens ?? 0,
    },
  };
}

// ── Outgoing: LlmMessage[] → OpenAI messages ──────────────

function buildChatMessages(
  systemPrompt: string,
  messages: LlmMessage[],
): ChatMessage[] {
  const out: ChatMessage[] = [];

  if (systemPrompt?.trim()) {
    out.push({ role: 'system', content: systemPrompt });
  }

  for (const msg of messages) {
    if (msg.role === 'user') {
      pushUserMessage(out, msg.content);
    } else {
      pushAssistantMessage(out, msg.content);
    }
  }

  return out;
}

function pushUserMessage(out: ChatMessage[], blocks: ContentBlock[]): void {
  // OpenAI spec splits a single "user turn with tool results" into:
  //   - zero or one role=user message (text/image)
  //   - N role=tool messages (one per tool_result)
  const toolResults = blocks.filter(
    (b) => b.type === ContentBlockType.ToolResult,
  ) as ToolResultBlock[];
  const userParts = blocks.filter(
    (b) => b.type !== ContentBlockType.ToolResult,
  );

  if (userParts.length > 0) {
    out.push({
      role: 'user',
      content: buildUserContent(userParts),
    });
  }

  for (const tr of toolResults) {
    const text = tr.content
      .filter((c) => c.type === ContentBlockType.Text)
      .map((c) => (c as TextBlock).text)
      .join('\n');

    out.push({
      role: 'tool',
      tool_call_id: tr.tool_use_id,
      content: tr.is_error ? `ERROR: ${text}` : text || '(no output)',
    });
  }
}

function pushAssistantMessage(
  out: ChatMessage[],
  blocks: ContentBlock[],
): void {
  const textParts = blocks.filter(
    (b) => b.type === ContentBlockType.Text,
  ) as TextBlock[];
  const toolUses = blocks.filter(
    (b) => b.type === ContentBlockType.ToolUse,
  ) as ToolUseBlock[];

  const joinedText = textParts.map((t) => t.text).join('\n').trim();

  const assistantMsg: AssistantMessageParam = {
    role: 'assistant',
    content: joinedText || null,
  };

  if (toolUses.length > 0) {
    assistantMsg.tool_calls = toolUses.map((tu) => ({
      id: tu.id,
      type: 'function',
      function: {
        name: tu.name,
        arguments: JSON.stringify(tu.input ?? {}),
      },
    }));
  }

  out.push(assistantMsg);
}

function buildUserContent(
  blocks: ContentBlock[],
): string | ChatContentPart[] {
  const hasImage = blocks.some((b) => b.type === ContentBlockType.Image);

  if (!hasImage) {
    return blocks
      .filter((b) => b.type === ContentBlockType.Text)
      .map((b) => (b as TextBlock).text)
      .join('\n');
  }

  const parts: ChatContentPart[] = [];
  for (const b of blocks) {
    if (b.type === ContentBlockType.Image) {
      const img = b as ImageBlock;
      parts.push({
        type: 'image_url',
        image_url: {
          url: `data:${img.source.media_type};base64,${img.source.data}`,
        },
      });
    } else if (b.type === ContentBlockType.Text) {
      parts.push({ type: 'text', text: (b as TextBlock).text });
    }
  }
  return parts;
}

function buildTools(tools: ToolDefinition[]): ChatTool[] {
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: {
        type: t.input_schema.type,
        properties: t.input_schema.properties,
        required: t.input_schema.required,
      },
    },
  }));
}

// ── Incoming: OpenAI response → ContentBlock[] ────────────

function parseMessage(
  message: OpenAI.Chat.Completions.ChatCompletionMessage,
): ContentBlock[] {
  const blocks: ContentBlock[] = [];

  if (message.content && typeof message.content === 'string') {
    blocks.push({
      type: ContentBlockType.Text,
      text: message.content,
    } as TextBlock);
  }

  if (message.tool_calls?.length) {
    for (const call of message.tool_calls) {
      if (call.type !== 'function') continue;

      let input: Record<string, unknown> = {};
      try {
        input = call.function.arguments
          ? (JSON.parse(call.function.arguments) as Record<string, unknown>)
          : {};
      } catch {
        input = { _raw_arguments: call.function.arguments };
      }

      blocks.push({
        type: ContentBlockType.ToolUse,
        id: call.id,
        name: call.function.name,
        input,
      } as ToolUseBlock);
    }
  }

  if (blocks.length === 0) {
    blocks.push({ type: ContentBlockType.Text, text: '' } as TextBlock);
  }

  return blocks;
}

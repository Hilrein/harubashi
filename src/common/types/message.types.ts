export enum MessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
}

export enum ContentBlockType {
  Text = 'text',
  Image = 'image',
  ToolUse = 'tool_use',
  ToolResult = 'tool_result',
  Thinking = 'thinking',
  RedactedThinking = 'redacted_thinking',
}

export interface TextBlock {
  type: ContentBlockType.Text;
  text: string;
  // Gemini 3+ thought signature (opaque base64). Must be echoed back on
  // subsequent turns for multi-step reasoning / tool use to work.
  // Ignored by non-Google providers.
  thoughtSignature?: string;
}

export interface ImageBlock {
  type: ContentBlockType.Image;
  source: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

export interface ToolUseBlock {
  type: ContentBlockType.ToolUse;
  id: string;
  name: string;
  input: Record<string, unknown>;
  // Gemini 3+ thought signature for this function call. Must be echoed back
  // on the same part when continuing the conversation. Ignored by non-Google providers.
  thoughtSignature?: string;
}

export interface ToolResultBlock {
  type: ContentBlockType.ToolResult;
  tool_use_id: string;
  content: ContentBlock[];
  is_error?: boolean;
}

export interface ThinkingBlock {
  type: ContentBlockType.Thinking;
  thinking: string;
  signature: string;
}

export interface RedactedThinkingBlock {
  type: ContentBlockType.RedactedThinking;
  data: string;
}

export type ContentBlock =
  | TextBlock
  | ImageBlock
  | ToolUseBlock
  | ToolResultBlock
  | ThinkingBlock
  | RedactedThinkingBlock;

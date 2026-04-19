import {
  ContentBlock,
  ContentBlockType,
  TextBlock,
  ImageBlock,
  ToolUseBlock,
  ToolResultBlock,
  ThinkingBlock,
  RedactedThinkingBlock,
} from '../types/message.types';

export function isTextBlock(block: unknown): block is TextBlock {
  return (
    typeof block === 'object' &&
    block !== null &&
    (block as ContentBlock).type === ContentBlockType.Text
  );
}

export function isImageBlock(block: unknown): block is ImageBlock {
  return (
    typeof block === 'object' &&
    block !== null &&
    (block as ContentBlock).type === ContentBlockType.Image
  );
}

export function isToolUseBlock(block: unknown): block is ToolUseBlock {
  return (
    typeof block === 'object' &&
    block !== null &&
    (block as ContentBlock).type === ContentBlockType.ToolUse
  );
}

export function isToolResultBlock(block: unknown): block is ToolResultBlock {
  return (
    typeof block === 'object' &&
    block !== null &&
    (block as ContentBlock).type === ContentBlockType.ToolResult
  );
}

export function isThinkingBlock(block: unknown): block is ThinkingBlock {
  return (
    typeof block === 'object' &&
    block !== null &&
    (block as ContentBlock).type === ContentBlockType.Thinking
  );
}

export function isRedactedThinkingBlock(
  block: unknown,
): block is RedactedThinkingBlock {
  return (
    typeof block === 'object' &&
    block !== null &&
    (block as ContentBlock).type === ContentBlockType.RedactedThinking
  );
}

export function isSystemToolUseBlock(block: unknown): block is ToolUseBlock {
  if (!isToolUseBlock(block)) return false;
  return block.name.startsWith('system_');
}

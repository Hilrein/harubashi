import { ToolDefinition } from '../common/types/tool.types';

export interface ParsedSkill {
  tool: ToolDefinition;
  instructions: string;
  filePath: string;
}

export interface SkillFrontmatter {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

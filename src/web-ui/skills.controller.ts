import { Controller, Get } from '@nestjs/common';
import { loadAllSkillFiles } from '../skills/skills-parser';
import { HarubashiPaths } from '../common/paths';

export interface SkillListItem {
  readonly name: string;
  readonly description: string;
  readonly isTool: boolean;
}

/**
 * Controller providing details on all active and guidance skills installed in Harubashi environment.
 */
@Controller('skills')
export class SkillsController {
  /**
   * List all skills parsed from the user's skills directory.
   */
  @Get()
  getSkills(): SkillListItem[] {
    const skills = loadAllSkillFiles(HarubashiPaths.skillsDir);
    return skills.map((s): SkillListItem => {
      const isTool = !!s.tool;
      let description = s.tool?.description ?? '';
      if (!description) {
        const firstLine = s.instructions
          .split(/\r?\n/)
          .map((l: string): string => l.trim())
          .find((l: string): boolean => l.length > 0 && !l.startsWith('#'));
        description = firstLine || '(no description)';
      }
      return {
        name: s.name,
        description,
        isTool,
      };
    });
  }
}

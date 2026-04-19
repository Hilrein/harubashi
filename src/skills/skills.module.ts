import { Global, Module } from '@nestjs/common';
import { SkillsService } from './skills.service';

@Global()
@Module({
  providers: [SkillsService],
  exports: [SkillsService],
})
export class SkillsModule {}

import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { HarubashiConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { SkillsModule } from './skills/skills.module';
import { SoulModule } from './soul/soul.module';
import { LlmModule } from './llm/llm.module';
import { AgentModule } from './agent/agent.module';

@Module({
  imports: [
    HarubashiConfigModule,
    EventEmitterModule.forRoot(),
    PrismaModule,
    SkillsModule,
    SoulModule,
    LlmModule,
    AgentModule,
  ],
})
export class AppModule {}

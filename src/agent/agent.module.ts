import { Module } from '@nestjs/common';
import { AgentProcessorService } from './agent.processor';
import { CommandGuardService } from './command-guard.service';
import { SystemExecutorService } from './system-executor.service';
import { InterruptionService } from './interruption.service';

@Module({
  providers: [
    AgentProcessorService,
    CommandGuardService,
    SystemExecutorService,
    InterruptionService,
  ],
  exports: [
    AgentProcessorService,
    CommandGuardService,
    SystemExecutorService,
    InterruptionService,
  ],
})
export class AgentModule {}

import { Module } from '@nestjs/common';
import { AgentModule } from '../agent/agent.module';
import { SessionsModule } from '../sessions/sessions.module';
import { PairingService } from './pairing.service';
import { TelegramService } from './telegram.service';

@Module({
  imports: [AgentModule, SessionsModule],
  providers: [PairingService, TelegramService],
  exports: [TelegramService, PairingService],
})
export class TelegramModule {}

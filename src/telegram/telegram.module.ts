import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AgentModule } from '../agent/agent.module';
import { PairingService } from './pairing.service';
import { TelegramService } from './telegram.service';

@Module({
  imports: [PrismaModule, AgentModule],
  providers: [PairingService, TelegramService],
  exports: [TelegramService, PairingService],
})
export class TelegramModule {}

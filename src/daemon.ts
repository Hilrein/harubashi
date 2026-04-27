import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { SessionsService } from './sessions/sessions.service';
import { TelegramService } from './telegram/telegram.service';
import { createHarubashiLogger } from './common/logger';

export async function runDaemon(): Promise<void> {
  // ── Boot NestJS in standalone mode (no HTTP) ─────────────
  // Winston handles both colored console output and JSON file logs.
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: createHarubashiLogger({ appName: 'Harubashi' }),
  });

  const logger = new Logger('Daemon');

  const sessions = app.get(SessionsService);
  const telegram = app.get(TelegramService);

  // ── Ensure the shared default user exists ────────────────
  await sessions.ensureDefaultUser();

  // ── Start Telegram bot ───────────────────────────────────
  await telegram.start();

  logger.log('Harubashi daemon is running. Press Ctrl+C to stop.');
}

if (require.main === module) {
  runDaemon().catch((err) => {
    console.error('Fatal error during daemon bootstrap:', err);
    process.exit(1);
  });
}

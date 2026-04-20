import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { SessionsService } from './sessions/sessions.service';
import { TelegramService } from './telegram/telegram.service';

async function bootstrap() {
  const logger = new Logger('Daemon');

  // ── Boot NestJS in standalone mode (no HTTP) ─────────────
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const sessions = app.get(SessionsService);
  const telegram = app.get(TelegramService);

  // ── Ensure the shared default user exists ────────────────
  await sessions.ensureDefaultUser();

  // ── Start Telegram bot ───────────────────────────────────
  await telegram.start();

  logger.log('Harubashi daemon is running. Press Ctrl+C to stop.');
}

bootstrap().catch((err) => {
  console.error('Fatal error during daemon bootstrap:', err);
  process.exit(1);
});

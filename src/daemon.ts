import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';
import { TelegramService } from './telegram/telegram.service';
import { DEFAULT_USER_ID, DEFAULT_USER_NAME } from './common/constants';

async function bootstrap() {
  const logger = new Logger('Daemon');

  // ── Boot NestJS in standalone mode (no HTTP) ─────────────
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const prisma = app.get(PrismaService);
  const telegram = app.get(TelegramService);

  // ── Ensure a default user exists ─────────────────────────
  await prisma.user.upsert({
    where: { id: DEFAULT_USER_ID },
    update: {},
    create: {
      id: DEFAULT_USER_ID,
      name: DEFAULT_USER_NAME,
    },
  });

  // ── Start Telegram bot ───────────────────────────────────
  await telegram.start();

  logger.log('Harubashi daemon is running. Press Ctrl+C to stop.');
}

bootstrap().catch((err) => {
  console.error('Fatal error during daemon bootstrap:', err);
  process.exit(1);
});

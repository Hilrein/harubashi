import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import * as readline from 'readline';
import { AppModule } from './app.module';
import { AgentProcessorService } from './agent/agent.processor';
import { PrismaService } from './prisma/prisma.service';

const SESSION_ID = 'cli-test-session';

async function bootstrap() {
  const logger = new Logger('CLI');

  // ── Boot NestJS in standalone mode (no HTTP) ─────────────
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const processor = app.get(AgentProcessorService);
  const prisma = app.get(PrismaService);

  // ── Ensure a test session exists ─────────────────────────
  await prisma.chatSession.upsert({
    where: { id: SESSION_ID },
    update: {},
    create: {
      id: SESSION_ID,
      title: 'CLI Test Session',
      status: 'ACTIVE',
    },
  });

  logger.log('Harubashi CLI ready. Type your message or "exit" to quit.\n');

  // ── Interactive REPL ─────────────────────────────────────
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  const prompt = () => {
    rl.question('\x1b[36mHarubashi >\x1b[0m ', async (input) => {
      const trimmed = input.trim();

      if (!trimmed) {
        prompt();
        return;
      }

      if (trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'quit') {
        logger.log('Shutting down...');
        rl.close();
        await app.close();
        process.exit(0);
      }

      // ── Pause CLI readline so CommandGuard can claim stdin ──
      rl.pause();
      (rl as any).terminal = false; // stop echoing while paused

      try {
        const result = await processor.process(SESSION_ID, trimmed);

        // ── Restore CLI readline ─────────────────────────────
        (rl as any).terminal = true;
        rl.resume();

        // ── Print result ─────────────────────────────────────
        console.log();
        console.log('\x1b[32m── Agent Response ──────────────────────\x1b[0m');
        console.log(result.finalText || '(no text response)');
        console.log('\x1b[90m───────────────────────────────────────');
        console.log(
          `  iterations: ${result.iterations} | ` +
            `tokens: ${result.totalTokens} | ` +
            `aborted: ${result.aborted} | ` +
            `task: ${result.taskId}`,
        );
        console.log('───────────────────────────────────────\x1b[0m');
        console.log();
      } catch (err) {
        (rl as any).terminal = true;
        rl.resume();

        console.error();
        console.error('\x1b[31m── Error ──────────────────────────────\x1b[0m');
        console.error(err.message || err);
        console.error('\x1b[31m───────────────────────────────────────\x1b[0m');
        console.error();
      }

      prompt();
    });
  };

  prompt();
}

bootstrap().catch((err) => {
  console.error('Fatal error during CLI bootstrap:', err);
  process.exit(1);
});

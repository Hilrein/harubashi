import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import * as readline from 'readline';
import { AppModule } from './app.module';
import { AgentProcessorService } from './agent/agent.processor';
import { PrismaService } from './prisma/prisma.service';
import { CliInteractionAdapter } from './common/adapters/cli-interaction.adapter';

const SESSION_ID = 'cli-test-session';
const DEFAULT_USER_ID = 'default';
const DEFAULT_USER_NAME = 'Harunauts';

async function bootstrap() {
  const logger = new Logger('CLI');

  // ── Boot NestJS in standalone mode (no HTTP) ─────────────
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const processor = app.get(AgentProcessorService);
  const prisma = app.get(PrismaService);

  // ── Ensure a default user exists (shared with Telegram daemon) ──
  await prisma.user.upsert({
    where: { id: DEFAULT_USER_ID },
    update: {},
    create: {
      id: DEFAULT_USER_ID,
      name: DEFAULT_USER_NAME,
    },
  });

  // ── Ensure a test session exists and is linked to the default user ──
  await prisma.chatSession.upsert({
    where: { id: SESSION_ID },
    update: { userId: DEFAULT_USER_ID },
    create: {
      id: SESSION_ID,
      userId: DEFAULT_USER_ID,
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

  // Single adapter instance — it borrows `rl` to pause/resume the REPL
  // around approval prompts so stdin is never contested.
  const adapter = new CliInteractionAdapter(rl);

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

      try {
        const result = await processor.process(SESSION_ID, trimmed, adapter);

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

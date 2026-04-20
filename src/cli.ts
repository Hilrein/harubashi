import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import * as readline from 'readline';
import { AppModule } from './app.module';
import { AgentProcessorService } from './agent/agent.processor';
import { PrismaService } from './prisma/prisma.service';
import { CliInteractionAdapter } from './common/adapters/cli-interaction.adapter';
import { DEFAULT_SESSION_ID, DEFAULT_USER_ID, DEFAULT_USER_NAME } from './common/constants';

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

  // ── Ensure a default session exists ────────────────────────
  await prisma.chatSession.upsert({
    where: { id: DEFAULT_SESSION_ID },
    update: { userId: DEFAULT_USER_ID },
    create: {
      id: DEFAULT_SESSION_ID,
      userId: DEFAULT_USER_ID,
      title: DEFAULT_SESSION_ID,
      status: 'ACTIVE',
    },
  });

  // ── Mutable session pointer ────────────────────────────────
  let currentSessionId = DEFAULT_SESSION_ID;

  logger.log(
    `Harubashi CLI ready. Session: "${currentSessionId}"\n` +
      `  Commands: /new <name> | /switch <name> | /sessions | exit\n`,
  );

  // ── Interactive REPL ─────────────────────────────────────
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  // Single adapter instance — it borrows `rl` to pause/resume the REPL
  // around approval prompts so stdin is never contested.
  const adapter = new CliInteractionAdapter(rl);

  // ── CLI command handlers ─────────────────────────────────

  async function handleNew(arg: string): Promise<void> {
    const name = arg.trim();
    if (!name) {
      console.log('\x1b[33mUsage: /new <session-name>\x1b[0m');
      return;
    }

    await prisma.chatSession.upsert({
      where: { id: name },
      update: { userId: DEFAULT_USER_ID },
      create: {
        id: name,
        userId: DEFAULT_USER_ID,
        title: name,
        status: 'ACTIVE',
      },
    });

    currentSessionId = name;
    console.log(
      `\x1b[32m[CLI] Switched to session: "${name}". Context is now fresh (or loaded from existing session).\x1b[0m`,
    );
  }

  async function handleSwitch(arg: string): Promise<void> {
    const name = arg.trim();
    if (!name) {
      console.log('\x1b[33mUsage: /switch <session-name>\x1b[0m');
      return;
    }

    const session = await prisma.chatSession.findUnique({
      where: { id: name },
    });

    if (!session) {
      console.log(
        `\x1b[31m[CLI] No session named "${name}". Use /sessions to list or /new <name> to create.\x1b[0m`,
      );
      return;
    }

    currentSessionId = name;
    const lastActive = session.updatedAt.toLocaleString();
    console.log(
      `\x1b[32m[CLI] Switched to "${name}". Last active: ${lastActive}\x1b[0m`,
    );
  }

  async function handleSessions(): Promise<void> {
    const sessions = await prisma.chatSession.findMany({
      select: { id: true, title: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    });

    if (sessions.length === 0) {
      console.log('\x1b[90m(no sessions)\x1b[0m');
      return;
    }

    console.log('\x1b[36m── Sessions ──────────────────────────────\x1b[0m');
    for (const s of sessions) {
      const marker = s.id === currentSessionId ? ' \x1b[32m→ (current)\x1b[0m' : '';
      const date = s.updatedAt.toLocaleString();
      console.log(`  ${s.id}  \x1b[90m${date}\x1b[0m${marker}`);
    }
    console.log('\x1b[36m──────────────────────────────────────────\x1b[0m');
  }

  // ── REPL loop ────────────────────────────────────────────

  const prompt = () => {
    rl.question(`\x1b[36m[${currentSessionId}] >\x1b[0m `, async (input) => {
      const trimmed = input.trim();

      if (!trimmed) {
        prompt();
        return;
      }

      const lower = trimmed.toLowerCase();

      if (lower === 'exit' || lower === 'quit') {
        logger.log('Shutting down...');
        rl.close();
        await app.close();
        process.exit(0);
      }

      // ── Slash commands ───────────────────────────────────
      if (trimmed.startsWith('/')) {
        const spaceIdx = trimmed.indexOf(' ');
        const cmd = (spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx)).toLowerCase();
        const arg = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1);

        try {
          switch (cmd) {
            case '/new':
              await handleNew(arg);
              break;
            case '/switch':
              await handleSwitch(arg);
              break;
            case '/sessions':
              await handleSessions();
              break;
            default:
              console.log(`\x1b[33mUnknown command: ${cmd}. Available: /new /switch /sessions\x1b[0m`);
          }
        } catch (err) {
          console.error(`\x1b[31m[CLI] Command error: ${err.message}\x1b[0m`);
        }

        prompt();
        return;
      }

      // ── Agent call ───────────────────────────────────────
      try {
        const result = await processor.process(currentSessionId, trimmed, adapter);

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

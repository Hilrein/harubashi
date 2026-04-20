import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { PrismaService } from '../prisma/prisma.service';
import { AgentProcessorService } from '../agent/agent.processor';
import { PairingService } from './pairing.service';
import { TelegramInteractionAdapter } from './telegram-interaction.adapter';
import { DEFAULT_USER_ID } from '../common/constants';

const MAX_TG_MESSAGE_LENGTH = 4096;

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private bot: Telegraf | null = null;

  /** Telegram user ID that has been paired to the local default user. */
  private pairedTelegramId: string | null = null;

  /** Maps Telegram chatId → current Prisma ChatSession ID. */
  private readonly sessionMap = new Map<number, string>();

  /** Tracks chats currently being processed to serialise per-chat. */
  private readonly busyChats = new Set<number>();

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly processor: AgentProcessorService,
    private readonly pairing: PairingService,
  ) {}

  // ══════════════════════════════════════════════════════════
  // ── Lifecycle ────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════

  async start(): Promise<void> {
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token) {
      this.logger.error(
        'TELEGRAM_BOT_TOKEN is not set. Cannot start Telegram bot.',
      );
      process.exit(1);
    }

    this.bot = new Telegraf(token, { handlerTimeout: Infinity });

    // ── Check pairing state ──────────────────────────────────
    this.pairedTelegramId = await this.pairing.getPairedTelegramId();

    if (this.pairedTelegramId) {
      this.logger.log(
        `Bot is paired with Telegram user ${this.pairedTelegramId}`,
      );
    } else {
      this.pairing.generate();
    }

    // ── Register handlers ────────────────────────────────────
    this.bot.start((ctx) => this.onStart(ctx));
    this.bot.command('pair', (ctx) => this.onPair(ctx));
    this.bot.command('new', (ctx) => this.onNew(ctx));
    this.bot.command('sessions', (ctx) => this.onSessions(ctx));
    this.bot.command('switch', (ctx) => this.onSwitch(ctx));
    this.bot.on('callback_query', (ctx) => this.onCallbackQuery(ctx));
    this.bot.on(message('text'), (ctx) => this.onTextMessage(ctx));

    // ── Register command menu (shown in Telegram "/" and Menu button) ──
    await this.bot.telegram.setMyCommands([
      { command: 'start', description: 'Show welcome and pairing status' },
      { command: 'pair', description: 'Pair device with Harubashi (usage: /pair <code>)' },
      { command: 'new', description: 'Create or switch to a new session' },
      { command: 'switch', description: 'Switch to an existing session' },
      { command: 'sessions', description: 'List all your active sessions' },
    ]);

    // ── Launch polling ───────────────────────────────────────
    this.bot.launch();
    this.logger.log('Telegram bot started (polling mode)');

    // Graceful shutdown
    const stop = () => {
      this.bot?.stop('SIGINT');
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  }

  // ══════════════════════════════════════════════════════════
  // ── Command handlers ─────────────────────────────────────
  // ══════════════════════════════════════════════════════════

  private async onStart(ctx: any): Promise<void> {
    const userId = String(ctx.from?.id);

    // Already paired and this is the paired user
    if (this.pairedTelegramId && userId === this.pairedTelegramId) {
      await ctx.reply('Already paired. Send me a message to get started.');
      return;
    }

    // Already paired but someone else
    if (this.pairedTelegramId) return;

    // Not paired — (re)generate code
    this.pairing.generate();
    await ctx.reply(
      'Welcome to Harubashi!\n\n' +
        'This bot is not yet paired to an operator.\n' +
        'Check the server console for the pairing code, then send:\n' +
        '/pair <CODE>',
    );
  }

  private async onPair(ctx: any): Promise<void> {
    // Already paired
    if (this.pairedTelegramId) return;

    const text: string = ctx.message?.text || '';
    const parts = text.split(/\s+/);
    const code = parts[1] || '';

    if (!code) return; // silent on empty

    const userId = String(ctx.from?.id);
    const success = await this.pairing.claim(code, userId);

    if (!success) return; // silent on wrong/expired code

    this.pairedTelegramId = userId;
    await ctx.reply(
      '✅ Successfully paired! You are now connected to Harubashi.\n' +
        'Send me a message to start chatting with your agent.',
    );
  }

  private async onNew(ctx: any): Promise<void> {
    if (!this.isAuthorised(ctx)) return;

    const text: string = ctx.message?.text || '';
    const parts = text.split(/\s+/);
    const name = parts[1] || '';
    const chatId: number = ctx.chat.id;

    if (!name) {
      await ctx.reply('Usage: /new <session-name>');
      return;
    }

    await this.prisma.chatSession.upsert({
      where: { id: name },
      update: { userId: DEFAULT_USER_ID },
      create: {
        id: name,
        userId: DEFAULT_USER_ID,
        title: name,
        status: 'ACTIVE',
      },
    });

    this.sessionMap.set(chatId, name);
    await ctx.reply(`✅ Switched to session: "${name}".`);
  }

  private async onSessions(ctx: any): Promise<void> {
    if (!this.isAuthorised(ctx)) return;

    const chatId: number = ctx.chat.id;
    const currentSessionId = this.sessionMap.get(chatId) ?? `tg-${chatId}`;

    const sessions = await this.prisma.chatSession.findMany({
      select: { id: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    });

    if (sessions.length === 0) {
      await ctx.reply('No sessions found.');
      return;
    }

    const lines = sessions.map((s) => {
      const marker = s.id === currentSessionId ? ' ← current' : '';
      const date = s.updatedAt.toLocaleString();
      return `• ${s.id}  (${date})${marker}`;
    });

    await ctx.reply(`Sessions:\n\n${lines.join('\n')}`);
  }

  private async onSwitch(ctx: any): Promise<void> {
    if (!this.isAuthorised(ctx)) return;

    const text: string = ctx.message?.text || '';
    const parts = text.split(/\s+/);
    const name = parts[1] || '';
    const chatId: number = ctx.chat.id;

    if (!name) {
      await ctx.reply('Usage: /switch <session-name>');
      return;
    }

    const session = await this.prisma.chatSession.findUnique({
      where: { id: name },
    });

    if (!session) {
      await ctx.reply(
        `No session named "${name}". Use /sessions to list or /new <name> to create.`,
      );
      return;
    }

    this.sessionMap.set(chatId, name);
    const lastActive = session.updatedAt.toLocaleString();
    await ctx.reply(`✅ Switched to "${name}". Last active: ${lastActive}`);
  }

  // ══════════════════════════════════════════════════════════
  // ── Text message → agent pipeline ────────────────────────
  // ══════════════════════════════════════════════════════════

  private async onTextMessage(ctx: any): Promise<void> {
    if (!this.isAuthorised(ctx)) return;

    const chatId: number = ctx.chat.id;
    const text: string = ctx.message?.text || '';

    if (!text.trim()) return;

    // Serialise: one agent run at a time per chat. The busy check applies
    // ONLY to new text messages — callback_query (button taps) and slash
    // commands must bypass it, otherwise the bot deadlocks while the
    // agent is waiting for approval.
    if (this.busyChats.has(chatId)) {
      await ctx.reply('⏳ Still processing the previous message. Please wait.');
      return;
    }

    this.busyChats.add(chatId);

    // CRITICAL: fire-and-forget. Do NOT await here.
    // Telegraf dispatches updates sequentially through each handler call.
    // If we awaited the agent loop, telegraf could not deliver the very
    // callback_query (button tap) the agent is waiting for — deadlock.
    // Returning early lets telegraf pump the next update immediately.
    void this.runAgent(chatId, text);
  }

  /**
   * Background agent execution. Owns the full lifecycle for one message,
   * including cleanup of `busyChats` so a crash or hang never leaves a
   * chat permanently locked.
   */
  private async runAgent(chatId: number, text: string): Promise<void> {
    try {
      const sessionId = await this.resolveSessionId(chatId);
      const adapter = new TelegramInteractionAdapter(this.bot!, chatId);

      const result = await this.processor.process(sessionId, text, adapter);

      const reply = result.finalText || '(no text response)';
      await this.sendLongMessage(chatId, reply);
    } catch (err) {
      this.logger.error(
        `Agent error for chat ${chatId}: ${err.message}`,
        err.stack,
      );
      try {
        await this.bot!.telegram.sendMessage(chatId, `❌ Error: ${err.message}`);
      } catch {
        // Non-fatal: chat may be unreachable.
      }
    } finally {
      this.busyChats.delete(chatId);
    }
  }

  // ══════════════════════════════════════════════════════════
  // ── Callback query (inline button press) ─────────────────
  // ══════════════════════════════════════════════════════════

  private async onCallbackQuery(ctx: any): Promise<void> {
    if (!this.isAuthorised(ctx)) return;

    const data: string = ctx.callbackQuery?.data || '';
    // data format: "<nonce>:yes" or "<nonce>:no"
    const lastColon = data.lastIndexOf(':');
    if (lastColon === -1) {
      await ctx.answerCbQuery().catch(() => {});
      return;
    }

    const nonce = data.slice(0, lastColon);
    const answer = data.slice(lastColon + 1);
    const approved = answer === 'yes';

    // IMPORTANT: answer the callback query FIRST so Telegram stops the
    // spinner on the button. The handleCallback() below may take a while
    // (agent resumes execution) and Telegram only allows ~30s to answer.
    await ctx.answerCbQuery(approved ? 'Approved' : 'Rejected').catch(() => {});

    const handled = await TelegramInteractionAdapter.handleCallback(
      this.bot!,
      nonce,
      approved,
    );

    if (!handled) {
      this.logger.warn(`Callback nonce not found (expired?): ${nonce}`);
    }
  }

  // ══════════════════════════════════════════════════════════
  // ── Helpers ──────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════

  private isAuthorised(ctx: any): boolean {
    if (!this.pairedTelegramId) return false;
    return String(ctx.from?.id) === this.pairedTelegramId;
  }

  /**
   * Resolve or create a Prisma ChatSession for a given Telegram chat.
   * First message from a chat auto-creates a session `tg-<chatId>`.
   */
  private async resolveSessionId(chatId: number): Promise<string> {
    const existing = this.sessionMap.get(chatId);
    if (existing) return existing;

    const sessionId = `tg-${chatId}`;

    await this.prisma.chatSession.upsert({
      where: { id: sessionId },
      update: { userId: DEFAULT_USER_ID },
      create: {
        id: sessionId,
        userId: DEFAULT_USER_ID,
        title: `Telegram ${chatId}`,
        status: 'ACTIVE',
      },
    });

    this.sessionMap.set(chatId, sessionId);
    return sessionId;
  }

  /**
   * Send a message to Telegram, splitting into chunks if it exceeds
   * Telegram's 4096-character limit.
   */
  private async sendLongMessage(
    chatId: number,
    text: string,
  ): Promise<void> {
    if (text.length <= MAX_TG_MESSAGE_LENGTH) {
      await this.bot!.telegram.sendMessage(chatId, text);
      return;
    }

    // Split on newlines near the limit
    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= MAX_TG_MESSAGE_LENGTH) {
        chunks.push(remaining);
        break;
      }

      let splitAt = remaining.lastIndexOf('\n', MAX_TG_MESSAGE_LENGTH);
      if (splitAt <= 0) splitAt = MAX_TG_MESSAGE_LENGTH;

      chunks.push(remaining.slice(0, splitAt));
      remaining = remaining.slice(splitAt).replace(/^\n/, '');
    }

    for (const chunk of chunks) {
      await this.bot!.telegram.sendMessage(chatId, chunk);
    }
  }
}

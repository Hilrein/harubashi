import { Injectable, Logger } from '@nestjs/common';
import { ChatSession } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_SESSION_ID,
  DEFAULT_USER_ID,
  DEFAULT_USER_NAME,
} from '../common/constants';

/**
 * Lightweight projection used by list views. Excludes heavy relations.
 */
export interface SessionSummary {
  id: string;
  title: string | null;
  updatedAt: Date;
}

/**
 * Single source of truth for User / ChatSession CRUD and the Telegram
 * pairing link. Presentation layers (CLI, Telegram bot) call into this
 * service instead of touching `PrismaService` directly so that session
 * semantics stay consistent across channels.
 */
@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── User management ──────────────────────────────────────

  /**
   * Upsert a user by id. If the record already exists it is left alone
   * (we do not clobber existing `name` / `telegramId`).
   */
  async ensureUser(id: string, name?: string): Promise<void> {
    await this.prisma.user.upsert({
      where: { id },
      update: {},
      create: {
        id,
        name: name ?? null,
      },
    });
  }

  /**
   * Convenience: make sure the shared default user exists. Used by both
   * CLI bootstrap and Telegram daemon bootstrap.
   */
  async ensureDefaultUser(): Promise<void> {
    return this.ensureUser(DEFAULT_USER_ID, DEFAULT_USER_NAME);
  }

  // ── Session CRUD ─────────────────────────────────────────

  /**
   * Upsert a chat session. If it already exists, the `userId` link is
   * refreshed (covers legacy rows created before `userId` was persisted).
   * Returns the resulting row.
   */
  async ensureSession(
    id: string,
    userId: string,
    title?: string,
  ): Promise<ChatSession> {
    return this.prisma.chatSession.upsert({
      where: { id },
      update: { userId },
      create: {
        id,
        userId,
        title: title ?? id,
        status: 'ACTIVE',
      },
    });
  }

  /** Convenience: ensure the shared default session exists. */
  async ensureDefaultSession(): Promise<ChatSession> {
    return this.ensureSession(DEFAULT_SESSION_ID, DEFAULT_USER_ID);
  }

  /**
   * List a user's sessions, most-recently-active first.
   */
  async listSessions(userId: string): Promise<SessionSummary[]> {
    return this.prisma.chatSession.findMany({
      where: { userId },
      select: { id: true, title: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /**
   * Look up a session by id. Returns `null` when not found.
   */
  async getSession(id: string): Promise<ChatSession | null> {
    return this.prisma.chatSession.findUnique({ where: { id } });
  }

  /**
   * Semantics of the `/new <name>` command: create the session if missing,
   * otherwise leave it alone. Always returns the session so the caller
   * can react based on whether context is fresh or restored.
   */
  async switchOrCreate(userId: string, name: string): Promise<ChatSession> {
    return this.ensureSession(name, userId);
  }

  // ── Telegram pairing ─────────────────────────────────────

  /**
   * Read the Telegram ID linked to the default user, or `null` if not paired.
   */
  async getPairedTelegramId(): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: DEFAULT_USER_ID },
    });
    return user?.telegramId ?? null;
  }

  /**
   * Link a Telegram user id to the default Harubashi user.
   */
  async setTelegramPairing(telegramId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: DEFAULT_USER_ID },
      data: { telegramId },
    });
  }
}

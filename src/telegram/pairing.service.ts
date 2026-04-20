import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';
import { DEFAULT_USER_ID } from '../common/constants';

const CODE_LENGTH = 9;
const CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface PendingCode {
  code: string;
  expiresAt: number;
}

/**
 * Manages the one-time device-pairing flow between a Telegram user and
 * the local Harubashi default user.
 *
 * Lifecycle:
 *  1. `generate()` → creates a 9-char alphanumeric code, valid for 5 min.
 *  2. Operator sees the code in the server console.
 *  3. Telegram user sends `/pair <code>`.
 *  4. `claim(code, telegramId)` → if valid & unexpired, persists `telegramId`
 *     on the default User row and returns `true`.
 */
@Injectable()
export class PairingService {
  private readonly logger = new Logger(PairingService.name);
  private pending: PendingCode | null = null;

  constructor(private readonly prisma: PrismaService) {}

  // ── Public API ──────────────────────────────────────────

  /**
   * Generate a fresh pairing code. Invalidates any previous code.
   * Returns the new code string.
   */
  generate(): string {
    const code = crypto
      .randomBytes(8)
      .toString('base64url')
      .replace(/[^A-Za-z0-9]/g, '')
      .slice(0, CODE_LENGTH)
      .toUpperCase();

    this.pending = {
      code,
      expiresAt: Date.now() + CODE_TTL_MS,
    };

    this.logger.warn(
      `\n` +
        `╔══════════════════════════════════════════════════════╗\n` +
        `║  Bot is not paired!                                 ║\n` +
        `║  Send this command to the Telegram bot to connect:  ║\n` +
        `║                                                     ║\n` +
        `║    /pair ${code}                              ║\n` +
        `║                                                     ║\n` +
        `║  Code expires in 5 minutes.                         ║\n` +
        `╚══════════════════════════════════════════════════════╝`,
    );

    return code;
  }

  /**
   * Attempt to claim the pairing with a code sent by a Telegram user.
   *
   * @returns `true` if pairing succeeded, `false` otherwise (wrong code,
   *          expired, or already paired).
   */
  async claim(code: string, telegramId: string): Promise<boolean> {
    if (!this.pending) return false;
    if (this.pending.code !== code.toUpperCase()) return false;
    if (Date.now() > this.pending.expiresAt) {
      this.logger.warn('Pairing code expired. Send /start to get a new one.');
      this.pending = null;
      return false;
    }

    // Persist the link
    await this.prisma.user.update({
      where: { id: DEFAULT_USER_ID },
      data: { telegramId },
    });

    this.pending = null;
    this.logger.log(`Paired successfully with Telegram user ${telegramId}`);
    return true;
  }

  /**
   * Check whether a default user already has a Telegram ID linked.
   * Returns the stored `telegramId` or `null`.
   */
  async getPairedTelegramId(): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: DEFAULT_USER_ID },
    });
    return user?.telegramId ?? null;
  }

  /**
   * Returns true if there is currently an unexpired pending code.
   */
  hasActivePendingCode(): boolean {
    if (!this.pending) return false;
    if (Date.now() > this.pending.expiresAt) {
      this.pending = null;
      return false;
    }
    return true;
  }
}

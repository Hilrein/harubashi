import { Logger } from '@nestjs/common';
import { Telegraf } from 'telegraf';
import { IInteractionAdapter } from '../common/adapters/interaction-adapter.interface';

/**
 * Per-invocation Telegram interaction adapter.
 * Sends an inline-keyboard message (✅ Yes / ❌ No) and waits for the user
 * to tap a button. The Promise resolves once the TelegramService routes
 * the corresponding callback_query back to us.
 */
export class TelegramInteractionAdapter implements IInteractionAdapter {
  private readonly logger = new Logger(TelegramInteractionAdapter.name);

  /**
   * Pending approval requests, keyed by a unique nonce embedded in the
   * callback_data. `TelegramService.handleCallbackQuery` looks up and
   * resolves these.
   */
  static readonly pendingApprovals = new Map<
    string,
    { resolve: (approved: boolean) => void; chatId: number; messageId: number }
  >();

  private static nonceCounter = 0;

  constructor(
    private readonly bot: Telegraf,
    private readonly chatId: number,
  ) {}

  async askForApproval(command: string): Promise<boolean> {
    const nonce = `approval_${Date.now()}_${++TelegramInteractionAdapter.nonceCounter}`;

    const displayCmd =
      command.length > 200 ? command.slice(0, 197) + '...' : command;

    const msg = await this.bot.telegram.sendMessage(
      this.chatId,
      `⚠️ *Agent wants to execute:*\n\`\`\`\n${displayCmd}\n\`\`\`\nAllow?`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Yes', callback_data: `${nonce}:yes` },
              { text: '❌ No', callback_data: `${nonce}:no` },
            ],
          ],
        },
      },
    );

    return new Promise<boolean>((resolve) => {
      TelegramInteractionAdapter.pendingApprovals.set(nonce, {
        resolve,
        chatId: this.chatId,
        messageId: msg.message_id,
      });
    });
  }

  /**
   * Called by `TelegramService` when a callback_query arrives.
   * Resolves the matching Promise and edits the message to remove buttons.
   *
   * @returns `true` if the callback was handled, `false` if nonce not found.
   */
  static async handleCallback(
    bot: Telegraf,
    nonce: string,
    approved: boolean,
  ): Promise<boolean> {
    const entry = TelegramInteractionAdapter.pendingApprovals.get(nonce);
    if (!entry) return false;

    TelegramInteractionAdapter.pendingApprovals.delete(nonce);

    const verdict = approved ? '✅ Approved' : '❌ Rejected';

    try {
      await bot.telegram.editMessageReplyMarkup(
        entry.chatId,
        entry.messageId,
        undefined,
        { inline_keyboard: [] },
      );
      await bot.telegram.sendMessage(entry.chatId, verdict);
    } catch {
      // Message may have been deleted or chat unavailable — non-fatal.
    }

    entry.resolve(approved);
    return true;
  }
}

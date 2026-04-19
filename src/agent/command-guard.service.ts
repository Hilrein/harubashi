import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IInteractionAdapter } from '../common/adapters/interaction-adapter.interface';

/**
 * Gate-keeper for shell command execution.
 *
 * Two-tier check:
 *   1. If the command's base binary is in the `HARUBASHI_SAFE_COMMANDS`
 *      whitelist → auto-approve (no user prompt).
 *   2. Otherwise → delegate to the channel-specific {@link IInteractionAdapter}
 *      (CLI prompt, Telegram inline buttons, etc.).
 */
@Injectable()
export class CommandGuardService {
  private readonly logger = new Logger(CommandGuardService.name);
  private readonly safeCommands: string[];

  constructor(private readonly configService: ConfigService) {
    const raw =
      this.configService.get<string>('HARUBASHI_SAFE_COMMANDS') || '';
    this.safeCommands = raw
      .split(',')
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean);

    this.logger.log(
      `Safe command whitelist: [${this.safeCommands.join(', ')}]`,
    );
  }

  async requestApproval(
    command: string,
    adapter: IInteractionAdapter,
  ): Promise<boolean> {
    if (this.isSafeCommand(command)) {
      this.logger.debug(`Auto-approved (whitelisted): ${command}`);
      return true;
    }

    return adapter.askForApproval(command);
  }

  // ── Private ─────────────────────────────────────────────

  private isSafeCommand(command: string): boolean {
    const trimmed = command.trim();
    const binary = trimmed.split(/\s+/)[0].toLowerCase();
    const baseName = binary.split('/').pop() || binary;
    return this.safeCommands.includes(baseName);
  }
}

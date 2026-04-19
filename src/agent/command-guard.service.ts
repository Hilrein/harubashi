import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as readline from 'readline';

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

  async requestApproval(command: string): Promise<boolean> {
    if (this.isSafeCommand(command)) {
      this.logger.debug(`Auto-approved (whitelisted): ${command}`);
      return true;
    }

    return this.promptUser(command);
  }

  // ── Private ─────────────────────────────────────────────

  private isSafeCommand(command: string): boolean {
    const trimmed = command.trim();
    const binary = trimmed.split(/\s+/)[0].toLowerCase();
    const baseName = binary.split('/').pop() || binary;
    return this.safeCommands.includes(baseName);
  }

  private promptUser(command: string): Promise<boolean> {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stderr,
        terminal: false,
      });

      const displayCmd =
        command.length > 120 ? command.slice(0, 117) + '...' : command;

      const writePrompt = () => {
        process.stderr.write(
          `\n⚠️  [Command Guard] Agent wants to execute:\n` +
            `   $ ${displayCmd}\n` +
            `   Allow? (y/n): `,
        );
      };

      writePrompt();

      const onLine = (answer: string) => {
        const normalized = answer.trim().toLowerCase();

        // Empty input — keep waiting, re-prompt
        if (normalized === '') {
          writePrompt();
          return;
        }

        const approved = normalized === 'y' || normalized === 'yes';
        const rejected = normalized === 'n' || normalized === 'no';

        if (!approved && !rejected) {
          // Unrecognized input — keep waiting
          process.stderr.write(
            `   Please type "y" to allow or "n" to reject: `,
          );
          return;
        }

        rl.off('line', onLine);
        rl.close();

        if (approved) {
          this.logger.log(`✅ User approved: ${displayCmd}`);
        } else {
          this.logger.log(`❌ User rejected: ${displayCmd}`);
        }

        resolve(approved);
      };

      rl.on('line', onLine);
    });
  }
}

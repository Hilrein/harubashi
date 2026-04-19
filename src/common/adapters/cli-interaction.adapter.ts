import { Logger } from '@nestjs/common';
import * as readline from 'readline';
import { IInteractionAdapter } from './interaction-adapter.interface';

/**
 * Interactive stdin/stderr approval prompt for the local CLI.
 *
 * Behaviour:
 * - Prints prompt to stderr (so it never pollutes structured stdout).
 * - Reads answer from stdin line-by-line.
 * - No timeout. Waits forever.
 * - Empty input → re-prompt (keep waiting).
 * - Unrecognised input → re-prompt with hint.
 * - `y` / `yes` → approve.   `n` / `no` → reject.
 *
 * The adapter borrows the host readline interface (if provided) to pause
 * the outer REPL while the approval prompt is active, preventing the two
 * prompts from fighting over stdin.
 */
export class CliInteractionAdapter implements IInteractionAdapter {
  private readonly logger = new Logger(CliInteractionAdapter.name);

  /**
   * @param hostRl  Optional outer readline interface (the REPL). If supplied,
   *                it will be paused for the duration of the approval prompt
   *                and resumed afterwards.
   */
  constructor(private readonly hostRl?: readline.Interface) {}

  askForApproval(command: string): Promise<boolean> {
    const displayCmd =
      command.length > 120 ? command.slice(0, 117) + '...' : command;

    // Pause the outer REPL so our readline can own stdin cleanly.
    const hadHost = !!this.hostRl;
    if (hadHost) {
      this.hostRl!.pause();
      // Stop terminal echo while our prompt runs.
      (this.hostRl as unknown as { terminal: boolean }).terminal = false;
    }

    return new Promise<boolean>((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stderr,
        terminal: false,
      });

      const writePrompt = () => {
        process.stderr.write(
          `\n⚠️  [Command Guard] Agent wants to execute:\n` +
            `   $ ${displayCmd}\n` +
            `   Allow? (y/n): `,
        );
      };

      writePrompt();

      const finish = (approved: boolean) => {
        rl.off('line', onLine);
        rl.close();

        if (hadHost) {
          (this.hostRl as unknown as { terminal: boolean }).terminal = true;
          this.hostRl!.resume();
        }

        if (approved) {
          this.logger.log(`User approved: ${displayCmd}`);
        } else {
          this.logger.log(`User rejected: ${displayCmd}`);
        }

        resolve(approved);
      };

      const onLine = (answer: string) => {
        const normalized = answer.trim().toLowerCase();

        // Empty input — keep waiting, re-prompt.
        if (normalized === '') {
          writePrompt();
          return;
        }

        if (normalized === 'y' || normalized === 'yes') {
          finish(true);
          return;
        }

        if (normalized === 'n' || normalized === 'no') {
          finish(false);
          return;
        }

        // Unrecognised — re-prompt inline.
        process.stderr.write(
          `   Please type "y" to allow or "n" to reject: `,
        );
      };

      rl.on('line', onLine);
    });
  }
}

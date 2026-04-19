import { Injectable, Logger } from '@nestjs/common';
import { ChildProcess } from 'child_process';

@Injectable()
export class InterruptionService {
  private readonly logger = new Logger(InterruptionService.name);
  private abortController: AbortController | null = null;
  private activeChild: ChildProcess | null = null;

  createAbortSignal(): AbortSignal {
    this.abortController = new AbortController();
    return this.abortController.signal;
  }

  registerChildProcess(child: ChildProcess): void {
    this.activeChild = child;
    child.once('exit', () => {
      if (this.activeChild === child) {
        this.activeChild = null;
      }
    });
  }

  interrupt(reason = 'User requested interruption'): void {
    this.logger.warn(`Interrupting: ${reason}`);

    if (this.activeChild && !this.activeChild.killed) {
      this.logger.log(`Killing active child process (PID ${this.activeChild.pid})`);
      this.activeChild.kill('SIGTERM');
      this.activeChild = null;
    }

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  isInterrupted(): boolean {
    return this.abortController?.signal?.aborted ?? false;
  }

  reset(): void {
    this.activeChild = null;
    this.abortController = null;
  }
}

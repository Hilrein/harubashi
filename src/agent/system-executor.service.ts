import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { exec, ChildProcess } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { CommandGuardService } from './command-guard.service';
import { InterruptionService } from './interruption.service';
import { IInteractionAdapter } from '../common/adapters/interaction-adapter.interface';
import { ToolResult } from '../common/types/tool.types';

@Injectable()
export class SystemExecutorService {
  private readonly logger = new Logger(SystemExecutorService.name);
  private readonly defaultTimeout: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly commandGuard: CommandGuardService,
    private readonly interruption: InterruptionService,
  ) {
    this.defaultTimeout =
      parseInt(
        this.configService.get<string>('HARUBASHI_COMMAND_TIMEOUT') || '30000',
        10,
      ) || 30000;
  }

  async executeCommand(
    input: {
      command: string;
      workdir?: string;
      timeout?: number;
    },
    adapter: IInteractionAdapter,
  ): Promise<ToolResult> {
    const { command, workdir, timeout } = input;
    const toolUseId = ''; // caller sets this

    // ── Command Guard ──────────────────────────────────────
    const approved = await this.commandGuard.requestApproval(command, adapter);
    if (!approved) {
      return {
        tool_use_id: toolUseId,
        output: 'User rejected the command execution.',
        is_error: true,
      };
    }

    // ── Execute ────────────────────────────────────────────
    const effectiveTimeout = timeout || this.defaultTimeout;
    const cwd = workdir || process.cwd();

    this.logger.log(`Executing: $ ${command}  (cwd: ${cwd}, timeout: ${effectiveTimeout}ms)`);

    return new Promise<ToolResult>((resolve) => {
      const child: ChildProcess = exec(
        command,
        {
          cwd,
          timeout: effectiveTimeout,
          maxBuffer: 1024 * 1024 * 5, // 5 MB
          env: { ...process.env },
          shell: process.platform === 'win32' ? 'powershell.exe' : '/bin/sh',
        },
        (error, stdout, stderr) => {
          const parts: string[] = [];

          if (stdout?.trim()) {
            parts.push(`[stdout]\n${stdout.trim()}`);
          }
          if (stderr?.trim()) {
            parts.push(`[stderr]\n${stderr.trim()}`);
          }

          if (error) {
            if (error.killed) {
              parts.push(`[error] Process killed (timeout or interruption)`);
            } else if (error.code !== undefined) {
              parts.push(`[error] Exit code ${error.code}: ${error.message}`);
            } else {
              parts.push(`[error] ${error.message}`);
            }

            resolve({
              tool_use_id: toolUseId,
              output: parts.join('\n\n') || 'Command failed with no output.',
              is_error: true,
            });
            return;
          }

          resolve({
            tool_use_id: toolUseId,
            output: parts.join('\n\n') || '(no output)',
            is_error: false,
          });
        },
      );

      this.interruption.registerChildProcess(child);
    });
  }

  async readFile(input: {
    path: string;
    encoding?: string;
    maxBytes?: number;
  }): Promise<ToolResult> {
    const filePath = path.resolve(input.path);
    const encoding = (input.encoding || 'utf-8') as BufferEncoding;

    try {
      const stat = await fs.stat(filePath);

      if (!stat.isFile()) {
        return {
          tool_use_id: '',
          output: `"${filePath}" is not a regular file.`,
          is_error: true,
        };
      }

      let content: string;

      if (input.maxBytes && input.maxBytes > 0) {
        const handle = await fs.open(filePath, 'r');
        const buffer = Buffer.alloc(input.maxBytes);
        const { bytesRead } = await handle.read(buffer, 0, input.maxBytes, 0);
        await handle.close();
        content = buffer.subarray(0, bytesRead).toString(encoding);
        if (bytesRead === input.maxBytes) {
          content += `\n\n[truncated at ${input.maxBytes} bytes — file size: ${stat.size} bytes]`;
        }
      } else {
        content = await fs.readFile(filePath, { encoding });
      }

      this.logger.log(`Read ${filePath} (${stat.size} bytes)`);

      return {
        tool_use_id: '',
        output: content,
        is_error: false,
      };
    } catch (err) {
      return {
        tool_use_id: '',
        output: `Failed to read "${filePath}": ${err.message}`,
        is_error: true,
      };
    }
  }

  async writeFile(input: {
    path: string;
    data: string;
    encoding?: string;
  }): Promise<ToolResult> {
    const filePath = path.resolve(input.path);
    const encoding = (input.encoding || 'utf-8') as BufferEncoding;

    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, input.data, { encoding });

      this.logger.log(`Wrote ${filePath} (${Buffer.byteLength(input.data, encoding)} bytes)`);

      return {
        tool_use_id: '',
        output: `Successfully wrote ${Buffer.byteLength(input.data, encoding)} bytes to "${filePath}".`,
        is_error: false,
      };
    } catch (err) {
      return {
        tool_use_id: '',
        output: `Failed to write "${filePath}": ${err.message}`,
        is_error: true,
      };
    }
  }

  async listDirectory(input: {
    path: string;
  }): Promise<ToolResult> {
    const dirPath = path.resolve(input.path);

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const lines = entries.map((e) => {
        const suffix = e.isDirectory() ? '/' : '';
        return `${e.name}${suffix}`;
      });

      this.logger.log(`Listed ${dirPath} (${entries.length} entries)`);

      return {
        tool_use_id: '',
        output: lines.join('\n') || '(empty directory)',
        is_error: false,
      };
    } catch (err) {
      return {
        tool_use_id: '',
        output: `Failed to list "${dirPath}": ${err.message}`,
        is_error: true,
      };
    }
  }

  async dispatch(
    toolName: string,
    input: Record<string, unknown>,
    adapter: IInteractionAdapter,
  ): Promise<ToolResult> {
    switch (toolName) {
      case 'system_execute_command':
        return this.executeCommand(
          input as { command: string; workdir?: string; timeout?: number },
          adapter,
        );
      case 'system_read_file':
        return this.readFile(
          input as { path: string; encoding?: string; maxBytes?: number },
        );
      case 'system_write_file':
        return this.writeFile(
          input as { path: string; data: string; encoding?: string },
        );
      case 'system_list_directory':
        return this.listDirectory(input as { path: string });
      default:
        return {
          tool_use_id: '',
          output: `Unknown tool: "${toolName}"`,
          is_error: true,
        };
    }
  }
}

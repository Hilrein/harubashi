import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { exec, ChildProcess } from 'child_process';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import { CommandGuardService } from './command-guard.service';
import { InterruptionService } from './interruption.service';
import { IInteractionAdapter } from '../common/adapters/interaction-adapter.interface';
import { ToolResult } from '../common/types/tool.types';
import { HarubashiPaths } from '../common/paths';

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

  // ══════════════════════════════════════════════════════════
  // ── Web Search (Super Search) ──────────────────────────
  // ══════════════════════════════════════════════════════════

  async webSearch(input: {
    action: 'search' | 'read';
    query?: string;
    url?: string;
  }): Promise<ToolResult> {
    const { action } = input;

    if (action === 'search') {
      return this.webSearchSearch(input.query);
    }

    if (action === 'read') {
      return this.webSearchRead(input.url);
    }

    return {
      tool_use_id: '',
      output: `Unknown web_search action: "${action}". Use "search" or "read".`,
      is_error: true,
    };
  }

  /** Branch A: search the web via Tavily API. */
  private async webSearchSearch(query?: string): Promise<ToolResult> {
    const apiKey = this.configService.get<string>('TAVILY_API_KEY');

    if (!apiKey) {
      return {
        tool_use_id: '',
        output:
          "Error: TAVILY_API_KEY is not configured. Please politely ask the user to run 'harubashi profile edit' to set it up.",
        is_error: true,
      };
    }

    if (!query || typeof query !== 'string' || !query.trim()) {
      return {
        tool_use_id: '',
        output: 'Error: Search query must not be empty.',
        is_error: true,
      };
    }

    try {
      this.logger.log(`Performing web search for: "${query.trim()}"`);

      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: apiKey,
          query: query.trim(),
          search_depth: 'advanced',
          include_answer: false,
          include_raw_content: false,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        return {
          tool_use_id: '',
          output: `Search failed: HTTP ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}. Explain the issue to the user and suggest looking for answers locally.`,
          is_error: true,
        };
      }

      const data = (await response.json()) as {
        results?: Array<{
          title?: string;
          url?: string;
          content?: string;
          published_date?: string;
        }>;
      };

      if (
        !data.results ||
        !Array.isArray(data.results) ||
        data.results.length === 0
      ) {
        return {
          tool_use_id: '',
          output: 'No relevant search results found.',
          is_error: false,
        };
      }

      const formatted = data.results
        .map(
          (r) =>
            `Title: ${r.title || 'Untitled'}\nDate: ${r.published_date || 'N/A'}\nURL: ${r.url || 'N/A'}\nContent: ${r.content || 'N/A'}`,
        )
        .join('\n\n');

      return {
        tool_use_id: '',
        output: formatted,
        is_error: false,
      };
    } catch (err: any) {
      return {
        tool_use_id: '',
        output: `Search failed: ${err.message || String(err)}. Explain the issue to the user and suggest looking for answers locally.`,
        is_error: true,
      };
    }
  }

  /** Branch B: fetch a web page and convert it to clean Markdown. */
  private async webSearchRead(url?: string): Promise<ToolResult> {
    if (!url || typeof url !== 'string' || !url.trim()) {
      return {
        tool_use_id: '',
        output: 'Error: URL must not be empty for action "read".',
        is_error: true,
      };
    }

    try {
      this.logger.log(`Fetching web page: ${url}`);

      const response = await fetch(url.trim(), {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        return {
          tool_use_id: '',
          output: `Failed to read page: HTTP ${response.status} ${response.statusText}. Try another URL or use search.`,
          is_error: true,
        };
      }

      // ── Content-Type guard ──────────────────────────────
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/html')) {
        return {
          tool_use_id: '',
          output: `Error: URL is not an HTML page (Content-Type: ${contentType}). If it's a file, use the download tool.`,
          is_error: true,
        };
      }

      const html = await response.text();

      // ── Clean DOM with cheerio ─────────────────────────
      const $ = cheerio.load(html);
      $('script, style, noscript, iframe, nav, footer, header, svg, img').remove();

      // ── Resolve relative links to absolute URLs ────────
      const pageUrl = url.trim();
      $('a[href]').each((_i, el) => {
        const href = $(el).attr('href');
        if (href) {
          try {
            $(el).attr('href', new URL(href, pageUrl).href);
          } catch {
            // ignore invalid URLs (mailto:, javascript:, etc.)
          }
        }
      });
      const bodyHtml = $('body').html();
      if (!bodyHtml || !bodyHtml.trim()) {
        return {
          tool_use_id: '',
          output: 'The page body is empty after cleaning.',
          is_error: false,
        };
      }

      // ── Convert to Markdown with Turndown ──────────────
      const turndown = new TurndownService({ headingStyle: 'atx' });
      let markdown = turndown.turndown(bodyHtml);

      // ── Context protection: truncate to 15 000 chars ──
      const MAX_CHARS = 15_000;
      if (markdown.length > MAX_CHARS) {
        markdown =
          markdown.substring(0, MAX_CHARS) +
          '\n\n[truncated — content exceeded 15 000 characters]';
      }

      return {
        tool_use_id: '',
        output: markdown,
        is_error: false,
      };
    } catch (err: any) {
      return {
        tool_use_id: '',
        output: `Failed to read page: ${err.message || String(err)}. Try another URL or use search.`,
        is_error: true,
      };
    }
  }

  // ══════════════════════════════════════════════════════════
  // ── File Download ──────────────────────────────────────
  // ══════════════════════════════════════════════════════════

  private async downloadFile(input: {
    url: string;
    filename?: string;
  }): Promise<ToolResult> {
    const { url: rawUrl, filename } = input;

    if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
      return {
        tool_use_id: '',
        output: 'Error: URL must not be empty.',
        is_error: true,
      };
    }

    try {
      this.logger.log(`Downloading file from: ${rawUrl}`);

      const response = await fetch(rawUrl.trim(), {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: '*/*',
        },
        signal: AbortSignal.timeout(60000),
      });

      if (!response.ok) {
        return {
          tool_use_id: '',
          output: `Failed to download file: HTTP ${response.status} ${response.statusText}.`,
          is_error: true,
        };
      }

      // ── Filename resolution chain ─────────────────────────
      let finalFilename = filename?.trim() || '';

      if (!finalFilename) {
        const disposition =
          response.headers.get('content-disposition') || '';
        const match = disposition.match(
          /filename[*]?=["']?([^"';\n]+)/i,
        );
        if (match?.[1]) finalFilename = match[1].trim();
      }

      if (!finalFilename) {
        try {
          finalFilename =
            new URL(rawUrl).pathname.split('/').pop() || '';
        } catch {
          /* ignore invalid URL */
        }
      }

      if (!finalFilename) {
        finalFilename = `downloaded_file_${Date.now()}`;
      }

      // ── SECURITY: strip path traversal ────────────────────
      finalFilename = path.basename(finalFilename);

      const filePath = path.join(
        HarubashiPaths.downloadsDir,
        finalFilename,
      );

      // ── Ensure downloads directory exists ──────────────────
      fsSync.mkdirSync(HarubashiPaths.downloadsDir, { recursive: true });

      // ── Stream-based save (no OOM on large files) ─────────
      if (!response.body) {
        return {
          tool_use_id: '',
          output: 'Failed to download file: empty response body.',
          is_error: true,
        };
      }

      const fileStream = fsSync.createWriteStream(filePath);
      // @ts-ignore — Node 18 WebStream ↔ Node Stream typing gap
      await pipeline(Readable.fromWeb(response.body), fileStream);

      this.logger.log(`Downloaded file saved to: ${filePath}`);

      return {
        tool_use_id: '',
        output: `File successfully downloaded and saved to: ${filePath}`,
        is_error: false,
      };
    } catch (err: any) {
      return {
        tool_use_id: '',
        output: `Failed to download file: ${err.message || String(err)}.`,
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
      case 'web_search':
        return this.webSearch(
          input as { action: 'search' | 'read'; query?: string; url?: string },
        );
      case 'download_file':
        return this.downloadFile(
          input as { url: string; filename?: string },
        );
      default:
        return {
          tool_use_id: '',
          output: `Unknown tool: "${toolName}"`,
          is_error: true,
        };
    }
  }
}

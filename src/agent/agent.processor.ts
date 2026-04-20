import { Injectable, Logger } from '@nestjs/common';
import * as os from 'os';
import { PrismaService } from '../prisma/prisma.service';
import { SoulService, SoulContext } from '../soul/soul.service';
import { SkillsService } from '../skills/skills.service';
import { LlmFactoryService } from '../llm/llm-factory.service';
import { SystemExecutorService } from './system-executor.service';
import { InterruptionService } from './interruption.service';
import { LlmMessage } from '../llm/llm.interface';
import {
  ContentBlock,
  ContentBlockType,
  TextBlock,
  ToolUseBlock,
  ToolResultBlock,
} from '../common/types/message.types';
import { isToolUseBlock, isThinkingBlock, isRedactedThinkingBlock } from '../common/utils/type-guards';
import { IInteractionAdapter } from '../common/adapters/interaction-adapter.interface';
import { DEFAULT_USER_NAME } from '../common/constants';

const MAX_ITERATIONS = 10;

export interface ProcessorResult {
  taskId: string;
  finalText: string;
  iterations: number;
  aborted: boolean;
  totalTokens: number;
}

@Injectable()
export class AgentProcessorService {
  private readonly logger = new Logger(AgentProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly soul: SoulService,
    private readonly skills: SkillsService,
    private readonly llmFactory: LlmFactoryService,
    private readonly executor: SystemExecutorService,
    private readonly interruption: InterruptionService,
  ) {}

  async process(
    sessionId: string,
    userMessage: string,
    adapter: IInteractionAdapter,
  ): Promise<ProcessorResult> {
    // ── 1. Ensure session & task exist ─────────────────────
    const task = await this.ensureActiveTask(sessionId, userMessage);
    const taskId = task.id;

    this.logger.log(`Processing task ${taskId} in session ${sessionId}`);

    // ── 2. Persist the incoming user message ───────────────
    await this.saveMessage(taskId, 'USER', [
      { type: ContentBlockType.Text, text: userMessage } as TextBlock,
    ]);

    // ── 3. Load full conversation history (session-wide) ───
    const conversationHistory = await this.loadHistory(sessionId);

    // ── 4. Build context ───────────────────────────────────
    const skillInstructions = this.skills.getSkillInstructions();
    const soulContext = await this.buildSoulContext(sessionId);
    const systemPrompt = this.soul.getSystemPrompt(soulContext, skillInstructions);
    const tools = this.skills.getTools();
    const llm = this.llmFactory.getProvider();

    // ── 5. Create abort signal ─────────────────────────────
    const signal = this.interruption.createAbortSignal();

    // ── 6. Agent loop ──────────────────────────────────────
    const messages: LlmMessage[] = [...conversationHistory];
    let iterations = 0;
    let finalText = '';
    let aborted = false;
    let totalTokens = 0;

    while (iterations < MAX_ITERATIONS) {
      iterations++;

      // ── Check interruption ───────────────────────────────
      if (this.interruption.isInterrupted()) {
        aborted = true;
        this.logger.warn(`Task ${taskId} interrupted at iteration ${iterations}`);
        break;
      }

      this.logger.log(
        `Iteration ${iterations}/${MAX_ITERATIONS} — sending ${messages.length} messages to ${this.llmFactory.getProviderName()}`,
      );

      // ── Call LLM ─────────────────────────────────────────
      let responseBlocks: ContentBlock[];

      try {
        const response = await llm.generateResponse(
          systemPrompt,
          messages,
          tools,
          signal,
        );

        responseBlocks = response.contentBlocks;
        totalTokens += response.tokenUsage.totalTokens;

        this.logger.debug(
          `LLM returned ${responseBlocks.length} block(s), tokens: +${response.tokenUsage.totalTokens}`,
        );
      } catch (err) {
        if (err.name === 'AbortError' || signal.aborted) {
          aborted = true;
          this.logger.warn(`Task ${taskId} aborted during LLM call`);
          break;
        }
        throw err;
      }

      // ── Persist assistant response ───────────────────────
      await this.saveMessage(taskId, 'ASSISTANT', responseBlocks);

      // ── Append to conversation ───────────────────────────
      messages.push({ role: 'assistant', content: responseBlocks });

      // ── Extract tool use blocks ──────────────────────────
      const toolUseBlocks = responseBlocks.filter(isToolUseBlock);

      if (toolUseBlocks.length === 0) {
        // No tool calls — extract final text and exit loop
        finalText = this.extractText(responseBlocks);
        this.logger.log(`Task ${taskId} completed with text response at iteration ${iterations}`);
        break;
      }

      // ── Execute tools ────────────────────────────────────
      const toolResults: ToolResultBlock[] = [];

      for (const toolBlock of toolUseBlocks) {
        if (this.interruption.isInterrupted()) {
          aborted = true;
          break;
        }

        this.logger.log(
          `Executing tool: ${toolBlock.name} (id: ${toolBlock.id})`,
        );

        let result: ToolResultBlock;

        try {
          const execResult = await this.executor.dispatch(
            toolBlock.name,
            toolBlock.input,
            adapter,
          );

          result = {
            type: ContentBlockType.ToolResult,
            tool_use_id: toolBlock.id,
            content: [
              {
                type: ContentBlockType.Text,
                text: execResult.output,
              } as TextBlock,
            ],
            is_error: execResult.is_error,
          };
        } catch (err) {
          result = {
            type: ContentBlockType.ToolResult,
            tool_use_id: toolBlock.id,
            content: [
              {
                type: ContentBlockType.Text,
                text: `Tool execution error: ${err.message}`,
              } as TextBlock,
            ],
            is_error: true,
          };
        }

        toolResults.push(result);

        this.logger.debug(
          `Tool ${toolBlock.name} → ${result.is_error ? 'ERROR' : 'OK'} (${(result.content[0] as TextBlock).text.length} chars)`,
        );
      }

      if (aborted) {
        this.logger.warn(`Task ${taskId} interrupted during tool execution`);
        break;
      }

      // ── Persist tool results as user message ─────────────
      await this.saveMessage(taskId, 'USER', toolResults);

      // ── Feed results back into conversation ──────────────
      messages.push({ role: 'user', content: toolResults });
    }

    // ── 7. Handle max iterations exceeded ──────────────────
    if (iterations >= MAX_ITERATIONS && !aborted && !finalText) {
      finalText =
        `Agent reached maximum iteration limit (${MAX_ITERATIONS}). ` +
        `The task may be incomplete. Please review the results and continue if needed.`;
      this.logger.warn(`Task ${taskId} hit MAX_ITERATIONS (${MAX_ITERATIONS})`);
    }

    // ── 8. Update task status ──────────────────────────────
    await this.prisma.task.update({
      where: { id: taskId },
      data: {
        status: aborted ? 'CANCELLED' : 'COMPLETED',
      },
    });

    this.interruption.reset();

    return {
      taskId,
      finalText,
      iterations,
      aborted,
      totalTokens,
    };
  }

  // ══════════════════════════════════════════════════════════
  // ── Private helpers ──────────────────────────────────────
  // ══════════════════════════════════════════════════════════

  /**
   * Gather runtime context for the Soul system prompt:
   * resolves user name from DB (via session), sniffs OS/host/node/cwd,
   * reads active LLM provider, formats current time for humans.
   */
  private async buildSoulContext(sessionId: string): Promise<SoulContext> {
    let userName = DEFAULT_USER_NAME;

    try {
      const session = await this.prisma.chatSession.findUnique({
        where: { id: sessionId },
        include: { user: true },
      });
      const dbName = session?.user?.name?.trim();
      if (dbName) userName = dbName;
    } catch (err) {
      this.logger.warn(
        `Failed to resolve userName from DB, falling back to "${DEFAULT_USER_NAME}": ${err.message}`,
      );
    }

    const now = new Date().toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    });

    return {
      userName,
      now,
      os: `${os.platform()} (${os.release()})`,
      host: os.hostname(),
      nodeVersion: process.version,
      cwd: process.cwd(),
      llmProvider: this.llmFactory.getProviderName(),
    };
  }

  private async ensureActiveTask(
    sessionId: string,
    description: string,
  ) {
    // Try to find an existing PENDING or RUNNING task in the session
    const existing = await this.prisma.task.findFirst({
      where: {
        sessionId,
        status: { in: ['PENDING', 'RUNNING'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      // Mark it as RUNNING if still PENDING
      if (existing.status === 'PENDING') {
        return this.prisma.task.update({
          where: { id: existing.id },
          data: { status: 'RUNNING' },
        });
      }
      return existing;
    }

    // Create a new task
    return this.prisma.task.create({
      data: {
        sessionId,
        description:
          description.length > 200
            ? description.slice(0, 197) + '...'
            : description,
        status: 'RUNNING',
      },
    });
  }

  private async saveMessage(
    taskId: string,
    role: 'USER' | 'ASSISTANT',
    content: ContentBlock[],
  ): Promise<void> {
    await this.prisma.message.create({
      data: {
        taskId,
        role,
        content: JSON.stringify(content),
      },
    });
  }

  private async loadHistory(sessionId: string): Promise<LlmMessage[]> {
    const dbMessages = await this.prisma.message.findMany({
      where: { task: { sessionId } },
      orderBy: { createdAt: 'asc' },
    });

    return dbMessages.map((msg) => ({
      role: msg.role === 'USER' ? ('user' as const) : ('assistant' as const),
      content: this.parseContent(msg.content),
    }));
  }

  private parseContent(raw: string): ContentBlock[] {
    try {
      return JSON.parse(raw) as ContentBlock[];
    } catch {
      // Fallback: treat as plain text
      return [
        { type: ContentBlockType.Text, text: raw } as TextBlock,
      ];
    }
  }

  private extractText(blocks: ContentBlock[]): string {
    return blocks
      .filter(
        (b) =>
          b.type === ContentBlockType.Text &&
          !isThinkingBlock(b) &&
          !isRedactedThinkingBlock(b),
      )
      .map((b) => (b as TextBlock).text)
      .join('\n\n');
  }
}

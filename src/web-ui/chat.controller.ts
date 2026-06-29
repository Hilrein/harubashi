import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { loadHarubashiConfig } from '../config/config-loader';
import { HarubashiPaths } from '../common/paths';
import { CreateMessageDto } from './models/create-message.dto';

/**
 * Controller to manage dialogue sessions and messages dynamically from SQLite database files.
 */
@Controller('chat')
export class ChatController {
  /**
   * Helper to instantiate a scoped, lightweight PrismaClient for the active profile.
   */
  private getPrismaClient(): PrismaClient {
    const config = loadHarubashiConfig();
    const activeProfile = config.activeProfile;
    const url = HarubashiPaths.databaseUrl(activeProfile);
    return new PrismaClient({
      datasources: {
        db: { url },
      },
    });
  }

  /**
   * Fetch all chat sessions.
   */
  @Get('sessions')
  async getSessions() {
    const prisma = this.getPrismaClient();
    try {
      return await prisma.chatSession.findMany({
        orderBy: { updatedAt: 'desc' },
        include: { user: true },
      });
    } finally {
      await prisma.$disconnect();
    }
  }

  /**
   * Create a new chat session.
   */
  @Post('sessions')
  async createSession(@Body() body: { title?: string }) {
    const prisma = this.getPrismaClient();
    try {
      return await prisma.chatSession.create({
        data: {
          title: body.title || 'New Session',
        },
      });
    } finally {
      await prisma.$disconnect();
    }
  }

  /**
   * Fetch message history for a given session.
   */
  @Get('messages/:sessionId')
  async getMessages(@Param('sessionId') sessionId: string) {
    const prisma = this.getPrismaClient();
    try {
      return await prisma.message.findMany({
        where: {
          task: {
            sessionId: sessionId,
          },
        },
        orderBy: { createdAt: 'asc' },
      });
    } finally {
      await prisma.$disconnect();
    }
  }

  /**
   * Post a user message and trigger a corresponding response mockup.
   */
  @Post('messages/:sessionId')
  async createMessage(
    @Param('sessionId') sessionId: string,
    @Body() body: CreateMessageDto,
  ) {
    const prisma = this.getPrismaClient();
    try {
      let task = await prisma.task.findFirst({
        where: { sessionId },
        orderBy: { createdAt: 'desc' },
      });
      if (!task) {
        task = await prisma.task.create({
          data: {
            sessionId,
            description: 'Web UI Chat Interaction',
          },
        });
      }
      const userMsg = await prisma.message.create({
        data: {
          taskId: task.id,
          role: 'USER',
          content: body.content,
        },
      });
      const assistantMsg = await prisma.message.create({
        data: {
          taskId: task.id,
          role: 'ASSISTANT',
          content: `Prompt received. To run full autonomous agent tasks, please start the background daemon: \`harubashi daemon\``,
        },
      });
      return [userMsg, assistantMsg];
    } finally {
      await prisma.$disconnect();
    }
  }
}

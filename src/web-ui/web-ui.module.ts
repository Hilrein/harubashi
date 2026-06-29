import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import * as path from 'path';
import { HarubashiConfigModule } from '../config/config.module';
import { StatusController } from './status.controller';
import { ProfilesController } from './profiles.controller';
import { ConfigController } from './config.controller';
import { LogsController } from './logs.controller';
import { SkillsController } from './skills.controller';
import { ChatController } from './chat.controller';

/**
 * Lightweight NestJS module activated exclusively by `harubashi ui`.
 *
 * Imports only what the Web UI needs:
 * - Configuration (to read the active profile)
 * - Static file serving (to deliver the React SPA from `ui/dist/`)
 * - StatusController (the `/api/status` endpoint)
 *
 * Does NOT import heavy modules (Agent, Sessions, Telegram, LLM, Prisma)
 * to keep RAM usage minimal — the UI is a stateless client.
 */
@Module({
  imports: [
    HarubashiConfigModule,
    ServeStaticModule.forRoot({
      // Resolve from dist/web-ui/ → ../../ui/dist (= project root ui/dist/)
      rootPath: path.resolve(__dirname, '..', '..', 'ui', 'dist'),
      // Exclude all api routes from static serving to allow clean NestJS 404 responses
      exclude: ['/api{*path}'],
    }),
  ],
  controllers: [
    StatusController,
    ProfilesController,
    ConfigController,
    LogsController,
    SkillsController,
    ChatController,
  ],
})
export class WebUiModule {}

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { WebUiModule } from './web-ui/web-ui.module';
import { createHarubashiLogger } from './common/logger';

/** Default port for the Web UI HTTP server. */
const DEFAULT_PORT = 8642;

/**
 * Bootstrap the lightweight Web UI HTTP server.
 *
 * Creates a full NestJS HTTP app (not standalone context) so it can
 * serve static files and handle REST requests. Uses the dedicated
 * `WebUiModule` which imports only config + static serving — no heavy
 * agent/telegram/LLM modules are loaded.
 *
 * @param options.port - HTTP port to listen on (default: 8642)
 */
export async function runWebUi(
  options: { port?: number } = {},
): Promise<void> {
  const port = options.port ?? DEFAULT_PORT;
  const app = await NestFactory.create(WebUiModule, {
    logger: createHarubashiLogger({ appName: 'WebUI' }),
  });
  // Enforce DTO validation constraints
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  // All controllers are prefixed with /api, static files are served at /
  app.setGlobalPrefix('api', { exclude: ['/'] });
  await app.listen(port);
  const logger = new Logger('WebUI');
  logger.log(`🚀 Harubashi Web UI is running at http://localhost:${port}`);
}

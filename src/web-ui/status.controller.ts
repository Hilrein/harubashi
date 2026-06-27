import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import type { StatusResponse } from './models/status-response.type';

/**
 * Provides the health-check endpoint for the Web UI.
 * Mounted under the global `/api` prefix → `GET /api/status`.
 */
@Controller('status')
export class StatusController {
  constructor(private readonly configService: ConfigService) {}

  /** Return the current server status, version, and active profile name. */
  @Get()
  getStatus(): StatusResponse {
    const pkgPath = path.resolve(__dirname, '..', '..', 'package.json');
    const pkg: { version: string } = JSON.parse(
      fs.readFileSync(pkgPath, 'utf-8'),
    );
    const activeProfile =
      this.configService.get<string>('HARUBASHI_ACTIVE_PROFILE') ?? 'unknown';
    return {
      status: 'ok',
      version: pkg.version,
      activeProfile,
    };
  }
}

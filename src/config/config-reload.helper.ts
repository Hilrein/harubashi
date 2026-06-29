import { ConfigService } from '@nestjs/config';
import { loadAndFlatten } from './config-loader';

/**
 * Hot-reloads the configuration variables stored inside the NestJS ConfigService.
 *
 * Reads config.yaml from disk, flattens the parameters, and overwrites the cached
 * variables inside ConfigService so that NestJS services instantly reflect modifications.
 *
 * @param configService - The global ConfigService instance from NestJS.
 */
export function reloadConfigCache(configService: ConfigService): void {
  const flat = loadAndFlatten();
  for (const [key, value] of Object.entries(flat)) {
    configService.set(key, value);
  }
}

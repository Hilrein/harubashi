import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { loadAndFlatten } from './config-loader';

/**
 * The single source of configuration is `~/.harubashi/config.yaml`.
 * No `.env` files are read. The active profile is flattened into the same
 * KEY=value shape that providers and services expect, so existing
 * `configService.get('NVIDIA_API_KEY')` calls continue to work unchanged.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      ignoreEnvVars: false,
      load: [() => loadAndFlatten()],
    }),
  ],
})
export class HarubashiConfigModule {}

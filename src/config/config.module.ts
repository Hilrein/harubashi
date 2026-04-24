import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as path from 'path';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        path.resolve(process.cwd(), '.env.local'),
        path.resolve(process.cwd(), '.env'),
      ],
      validate: (config: Record<string, unknown>) => {
        const required: string[] = ['DATABASE_URL', 'HARUBASHI_LLM_PROVIDER'];

        const providerKeyMap: Record<string, string[]> = {
          anthropic: ['ANTHROPIC_API_KEY'],
          openai: ['OPENAI_API_KEY'],
          google: [
            'GOOGLE_CLIENT_ID',
            'GOOGLE_CLIENT_SECRET',
            'GOOGLE_REFRESH_TOKEN',
          ],
          proxy: ['HARUBASHI_PROXY_BASE_URL', 'HARUBASHI_PROXY_MODEL'],
          nvidia: ['NVIDIA_API_KEY'],
        };

        const missing = required.filter((key) => !config[key]);
        if (missing.length > 0) {
          throw new Error(
            `Missing required env variables: ${missing.join(', ')}`,
          );
        }

        const provider = config['HARUBASHI_LLM_PROVIDER'] as string;
        const validProviders = Object.keys(providerKeyMap);
        if (!validProviders.includes(provider)) {
          throw new Error(
            `HARUBASHI_LLM_PROVIDER must be one of: ${validProviders.join(', ')}. Got: "${provider}"`,
          );
        }

        const providerKeys = providerKeyMap[provider] || [];
        const missingProvider = providerKeys.filter((key) => !config[key]);
        if (missingProvider.length > 0) {
          throw new Error(
            `Provider "${provider}" requires: ${missingProvider.join(', ')}`,
          );
        }

        return config;
      },
    }),
  ],
})
export class HarubashiConfigModule {}

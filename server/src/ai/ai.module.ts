import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AI_SUGGESTION_PROVIDER, type AiSuggestionProvider } from './ai-provider.interface.js';
import { AiService } from './ai.service.js';
import { AnthropicAiProvider } from './providers/anthropic-ai.provider.js';
import { MockAiProvider } from './providers/mock-ai.provider.js';
import { OpenAiCompatibleProvider } from './providers/openai-compatible.provider.js';
import { OPENAI_COMPATIBLE_PRESETS } from './providers/provider-presets.js';

function createProvider(config: ConfigService, mock: MockAiProvider): AiSuggestionProvider {
  const logger = new Logger('AiModule');
  const selected = (config.get<string>('AI_PROVIDER') ?? 'pollinations').toLowerCase();
  const maxTokens = Number(config.get<string>('AI_MAX_TOKENS') ?? 1024);

  if (selected === 'mock') {
    return mock;
  }

  if (selected === 'anthropic') {
    return new AnthropicAiProvider({
      apiKey: config.get<string>('ANTHROPIC_API_KEY'),
      model: config.get<string>('ANTHROPIC_MODEL') ?? 'claude-opus-5',
      effort: (config.get<string>('ANTHROPIC_EFFORT') ?? 'low') as 'low',
      maxTokens: Math.max(maxTokens, 4096),
    });
  }

  const preset = OPENAI_COMPATIBLE_PRESETS[selected];
  if (!preset) {
    logger.warn(`Unknown AI_PROVIDER "${selected}" — using the mock provider.`);
    return mock;
  }

  const apiKey = config.get<string>(preset.apiKeyEnv);
  if (preset.requiresApiKey && !apiKey) {
    logger.warn(
      `AI_PROVIDER="${selected}" needs ${preset.apiKeyEnv}. Get a key at ${preset.signupUrl}.`,
    );
  }

  return new OpenAiCompatibleProvider({
    name: selected,
    apiKey,
    requiresApiKey: preset.requiresApiKey,
    baseUrl: config.get<string>('AI_BASE_URL') ?? preset.baseUrl,
    model: config.get<string>('AI_MODEL') ?? preset.model,
    maxTokens,
    timeoutMs: Number(config.get<string>('AI_TIMEOUT_MS') ?? 60000),
  });
}

@Module({
  imports: [ConfigModule],
  providers: [
    MockAiProvider,
    {
      provide: AI_SUGGESTION_PROVIDER,
      inject: [ConfigService, MockAiProvider],
      useFactory: createProvider,
    },
    AiService,
  ],
  exports: [AiService],
})
export class AiModule {}

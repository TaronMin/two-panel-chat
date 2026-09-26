import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Message } from '../chat/contracts/models.js';
import {
  AI_SUGGESTION_PROVIDER,
  type AiSuggestion,
  type AiSuggestionProvider,
} from './ai-provider.interface.js';
import { MockAiProvider } from './providers/mock-ai.provider.js';

export interface AiProviderInfo {
  name: string;
  model?: string;
  configured: boolean;
  usingFallback: boolean;
}

const DEFAULT_PERSONA =
  'You are the answerer in a support conversation: helpful, direct, and warm without being chatty.';

const HISTORY_WINDOW = 30;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly persona: string;
  private lastCallFellBack = false;

  constructor(
    @Inject(AI_SUGGESTION_PROVIDER)
    private readonly provider: AiSuggestionProvider,
    private readonly fallback: MockAiProvider,
    config: ConfigService,
  ) {
    this.persona = config.get<string>('AI_PERSONA') ?? DEFAULT_PERSONA;
    this.logger.log(
      `AI suggestions via "${provider.name}"${provider.model ? ` (${provider.model})` : ''}` +
        (provider.isConfigured() ? '' : ' — no API key set, the mock provider will answer'),
    );
  }

  describeProvider(): AiProviderInfo {
    return {
      name: this.provider.name,
      model: this.provider.model,
      configured: this.provider.isConfigured(),
      usingFallback: this.lastCallFellBack,
    };
  }

  async suggestReply(
    conversationId: string,
    messages: Message[],
    instruction?: string,
  ): Promise<AiSuggestion> {
    const context = {
      conversationId,
      messages: messages.slice(-HISTORY_WINDOW),
      instruction,
      persona: this.persona,
    };

    if (!this.provider.isConfigured()) {
      this.lastCallFellBack = true;
      return this.fallback.generate(context);
    }

    try {
      const suggestion = await this.provider.generate(context);
      this.lastCallFellBack = false;
      return suggestion;
    } catch (error) {
      this.logger.error(
        `Provider "${this.provider.name}" failed; falling back to the mock provider`,
        error instanceof Error ? error.message : String(error),
      );
      this.lastCallFellBack = true;
      return this.fallback.generate(context);
    }
  }
}

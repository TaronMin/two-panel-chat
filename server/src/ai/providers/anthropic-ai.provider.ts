import Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger } from '@nestjs/common';
import type { Message } from '../../chat/contracts/models.js';
import type {
  AiSuggestion,
  AiSuggestionContext,
  AiSuggestionProvider,
} from '../ai-provider.interface.js';

export interface AnthropicProviderOptions {
  apiKey?: string;
  model: string;
  effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  maxTokens: number;
}

@Injectable()
export class AnthropicAiProvider implements AiSuggestionProvider {
  readonly name = 'anthropic';
  readonly model: string;

  private readonly logger = new Logger(AnthropicAiProvider.name);
  private readonly client: Anthropic;
  private readonly options: AnthropicProviderOptions;

  constructor(options: AnthropicProviderOptions) {
    this.options = options;
    this.model = options.model;
    this.client = options.apiKey ? new Anthropic({ apiKey: options.apiKey }) : new Anthropic();
  }

  isConfigured(): boolean {
    return Boolean(this.options.apiKey ?? process.env['ANTHROPIC_API_KEY']);
  }

  async generate(context: AiSuggestionContext): Promise<AiSuggestion> {
    const startedAt = Date.now();
    const turns = this.toTurns(context.messages);

    if (turns.length === 0 || turns[turns.length - 1]!.role !== 'user') {
      turns.push({
        role: 'user',
        content: '(No new message yet — open the conversation with a helpful greeting.)',
      });
    }
    if (context.instruction) {
      turns.push({
        role: 'user',
        content: `(Instruction for your reply: ${context.instruction})`,
      });
    }

    const response = await this.client.beta.messages.create({
      model: this.options.model,
      max_tokens: this.options.maxTokens,
      system: this.systemPrompt(context.persona),
      messages: turns,
      output_config: { effort: this.options.effort },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });

    if (response.stop_reason === 'refusal') {
      this.logger.warn(`Suggestion declined (${response.stop_details?.category ?? 'unspecified'})`);
      throw new Error('The model declined to draft a reply for this conversation.');
    }

    const content = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();

    if (!content) {
      throw new Error('The model returned an empty suggestion.');
    }

    return {
      content,
      provider: this.name,
      model: response.model ?? this.options.model,
      latencyMs: Date.now() - startedAt,
    };
  }

  private systemPrompt(persona: string): string {
    return `${persona}

You are drafting the next reply in a live two-person chat. Write only the message body: no greeting boilerplate unless it fits, no quotation marks, no "Here is a draft" preamble, and no role labels. Keep it to a few sentences unless the question genuinely needs more. A human reviews your draft before it is sent, so favour a concrete, sendable reply over hedging.`;
  }

  private toTurns(messages: Message[]): Anthropic.MessageParam[] {
    const turns: Anthropic.MessageParam[] = [];
    for (const message of messages) {
      const role: Anthropic.MessageParam['role'] = message.sender === 'user' ? 'user' : 'assistant';
      const previous = turns[turns.length - 1];
      if (previous && previous.role === role) {
        previous.content = `${previous.content as string}\n${message.content}`;
        continue;
      }
      turns.push({ role, content: message.content });
    }
    return turns;
  }
}

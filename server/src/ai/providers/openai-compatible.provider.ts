import { Injectable } from '@nestjs/common';
import type { Message } from '../../chat/contracts/models.js';
import type {
  AiSuggestion,
  AiSuggestionContext,
  AiSuggestionProvider,
} from '../ai-provider.interface.js';

export interface OpenAiCompatibleOptions {
  name: string;
  apiKey?: string;
  requiresApiKey: boolean;
  baseUrl: string;
  model: string;
  maxTokens: number;
  timeoutMs?: number;
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[];
  model?: string;
  error?: { message?: string } | string;
}

const DEFAULT_TIMEOUT_MS = 60_000;

@Injectable()
export class OpenAiCompatibleProvider implements AiSuggestionProvider {
  readonly name: string;
  readonly model: string;

  private readonly options: OpenAiCompatibleOptions;

  constructor(options: OpenAiCompatibleOptions) {
    this.options = options;
    this.name = options.name;
    this.model = options.model;
  }

  isConfigured(): boolean {
    return this.options.requiresApiKey ? Boolean(this.options.apiKey) : true;
  }

  async generate(context: AiSuggestionContext): Promise<AiSuggestion> {
    const startedAt = Date.now();

    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };
    if (this.options.apiKey) {
      headers['authorization'] = `Bearer ${this.options.apiKey}`;
    }

    const response = await fetch(`${this.options.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      body: JSON.stringify({
        model: this.options.model,
        max_tokens: this.options.maxTokens,
        temperature: 0.7,
        messages: [
          { role: 'system', content: this.systemPrompt(context.persona) },
          ...this.toTurns(context.messages),
          ...(context.instruction
            ? [
                {
                  role: 'user',
                  content: `(Instruction for your reply: ${context.instruction})`,
                },
              ]
            : []),
        ],
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as ChatCompletionResponse;

    if (!response.ok) {
      const detail = typeof payload.error === 'string' ? payload.error : payload.error?.message;
      throw new Error(`${this.name} returned ${response.status}: ${detail ?? 'unknown error'}`);
    }

    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error(`${this.name} returned an empty suggestion.`);
    }

    return {
      content: this.stripWrappingQuotes(this.stripSponsorTrailer(content)),
      provider: this.name,
      model: payload.model ?? this.options.model,
      latencyMs: Date.now() - startedAt,
    };
  }

  private systemPrompt(persona: string): string {
    return `${persona}

You are the answerer in a live two-person chat. Reply to the user's most recent message, taking the whole conversation into account.

Rules:
- Write only the message body. No preamble, no role labels, no surrounding quotes, no markdown headings.
- Never repeat a reply you have already sent; move the conversation forward.
- Be specific to what the user actually wrote. Ask a clarifying question when you genuinely need one.
- Keep it to a few sentences unless more is genuinely needed.`;
  }

  private stripSponsorTrailer(content: string): string {
    const marker = /\n*\s*-{3,}\s*\n*\s*(?=(\*\*)?(Support|Sponsor|Ad\b|🌸))/i.exec(content);
    const trimmed = marker ? content.slice(0, marker.index) : content;
    return trimmed.replace(/\n*\s*-{3,}\s*$/, '').trimEnd();
  }

  private stripWrappingQuotes(content: string): string {
    const match = /^"([\s\S]+)"$/.exec(content);
    return match ? match[1]!.trim() : content;
  }

  private toTurns(messages: Message[]): { role: 'user' | 'assistant'; content: string }[] {
    return messages.map((message) => ({
      role: message.sender === 'user' ? ('user' as const) : ('assistant' as const),
      content: message.content,
    }));
  }
}

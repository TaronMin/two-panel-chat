import type { Message } from '../chat/contracts/models.js';

export interface AiSuggestionContext {
  conversationId: string;
  messages: Message[];
  instruction?: string;
  persona: string;
}

export interface AiSuggestion {
  content: string;
  provider: string;
  model?: string;
  latencyMs: number;
}

export interface AiSuggestionProvider {
  readonly name: string;
  readonly model?: string;
  isConfigured(): boolean;
  generate(context: AiSuggestionContext): Promise<AiSuggestion>;
}

export const AI_SUGGESTION_PROVIDER = Symbol('AI_SUGGESTION_PROVIDER');

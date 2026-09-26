import { Injectable } from '@nestjs/common';
import type {
  AiSuggestion,
  AiSuggestionContext,
  AiSuggestionProvider,
} from '../ai-provider.interface.js';

@Injectable()
export class MockAiProvider implements AiSuggestionProvider {
  readonly name = 'mock';
  readonly model = 'heuristic-v1';

  isConfigured(): boolean {
    return true;
  }

  async generate(context: AiSuggestionContext): Promise<AiSuggestion> {
    const startedAt = Date.now();
    await new Promise((resolve) => setTimeout(resolve, 600 + Math.random() * 700));

    const lastUserMessage = [...context.messages]
      .reverse()
      .find((message) => message.sender === 'user');

    return {
      content: this.draft(lastUserMessage?.content, context.instruction),
      provider: this.name,
      model: this.model,
      latencyMs: Date.now() - startedAt,
    };
  }

  private draft(lastMessage: string | undefined, instruction?: string): string {
    if (!lastMessage) {
      return 'Hi! Thanks for reaching out — how can I help you today?';
    }

    const trimmed = lastMessage.trim();
    const topic = this.topicOf(trimmed);
    const steer = instruction ? ` (noted: ${instruction})` : '';

    if (/\?\s*$/.test(trimmed)) {
      return `Good question about ${topic}. Here's where things stand: I can confirm the details and follow up with specifics shortly.${steer}`;
    }
    if (/\b(thanks|thank you|cheers|appreciate)\b/i.test(trimmed)) {
      return `Happy to help! Let me know if anything else about ${topic} comes up.${steer}`;
    }
    if (/\b(problem|issue|error|broken|fail|bug|not working)\b/i.test(trimmed)) {
      return `Sorry about the trouble with ${topic}. I'm looking into it now — could you tell me when it started and what you saw?${steer}`;
    }
    if (/\b(hi|hello|hey|good (morning|afternoon|evening))\b/i.test(trimmed)) {
      return `Hello! I'm here and ready to help — what would you like to go over?${steer}`;
    }

    return `Thanks for the detail on ${topic}. Here's my read: that's workable, and I'd suggest we confirm the specifics before moving ahead.${steer}`;
  }

  private topicOf(message: string): string {
    const stopWords = new Set([
      'this',
      'that',
      'with',
      'have',
      'what',
      'when',
      'where',
      'your',
      'from',
      'about',
      'there',
      'would',
      'could',
      'should',
      'they',
      'them',
      'then',
      'than',
      'been',
      'because',
      'which',
      'while',
      'into',
      'just',
      'like',
      'need',
      'want',
      'know',
      'make',
      'does',
      'doing',
      'said',
      'tell',
      'some',
      'very',
      'still',
      'also',
    ]);
    const candidate = message
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 3 && !stopWords.has(word))
      .sort((a, b) => b.length - a.length)[0];

    return candidate ?? 'that';
  }
}

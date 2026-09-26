import type { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Message } from '../chat/contracts/models.js';
import type { AiSuggestion, AiSuggestionProvider } from './ai-provider.interface.js';
import { AiService } from './ai.service.js';
import { MockAiProvider } from './providers/mock-ai.provider.js';

const PROVIDER_SUGGESTION: AiSuggestion = {
  content: 'A real answer',
  provider: 'groq',
  model: 'openai/gpt-oss-120b',
  latencyMs: 42,
};

function createProvider(overrides: Partial<AiSuggestionProvider> = {}) {
  return {
    name: 'groq',
    model: 'openai/gpt-oss-120b',
    isConfigured: vi.fn().mockReturnValue(true),
    generate: vi.fn().mockResolvedValue(PROVIDER_SUGGESTION),
    ...overrides,
  };
}

function createConfig(values: Record<string, string> = {}) {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

function message(id: string, content: string): Message {
  return {
    id,
    conversationId: 'conversation-1',
    sender: 'user',
    content,
    mode: 'manual',
    createdAt: new Date().toISOString(),
    status: 'sent',
  };
}

describe('AiService', () => {
  let fallback: MockAiProvider;

  beforeEach(() => {
    fallback = new MockAiProvider();
    vi.spyOn(fallback, 'generate');
  });

  function build(provider: ReturnType<typeof createProvider>, config = createConfig()) {
    return new AiService(provider, fallback, config);
  }

  describe('when the provider has no key', () => {
    it('answers from the mock without calling the provider', async () => {
      const provider = createProvider({ isConfigured: vi.fn().mockReturnValue(false) });
      const service = build(provider);

      const suggestion = await service.suggestReply('conversation-1', []);

      expect(provider.generate).not.toHaveBeenCalled();
      expect(fallback.generate).toHaveBeenCalled();
      expect(suggestion.provider).toBe('mock');
    });

    it('reports the fallback in describeProvider', async () => {
      const provider = createProvider({ isConfigured: vi.fn().mockReturnValue(false) });
      const service = build(provider);
      await service.suggestReply('conversation-1', []);

      expect(service.describeProvider()).toMatchObject({
        name: 'groq',
        configured: false,
        usingFallback: true,
      });
    });
  });

  describe('when the provider throws', () => {
    it('degrades to the mock instead of failing the request', async () => {
      const provider = createProvider({
        generate: vi.fn().mockRejectedValue(new Error('404 model_not_found')),
      });
      const service = build(provider);

      const suggestion = await service.suggestReply('conversation-1', []);

      expect(suggestion.provider).toBe('mock');
      expect(service.describeProvider().usingFallback).toBe(true);
    });

    it('resets usingFallback once a later call succeeds', async () => {
      const provider = createProvider({
        generate: vi
          .fn()
          .mockRejectedValueOnce(new Error('transient'))
          .mockResolvedValue(PROVIDER_SUGGESTION),
      });
      const service = build(provider);

      await service.suggestReply('conversation-1', []);
      expect(service.describeProvider().usingFallback).toBe(true);

      const suggestion = await service.suggestReply('conversation-1', []);
      expect(suggestion).toEqual(PROVIDER_SUGGESTION);
      expect(service.describeProvider().usingFallback).toBe(false);
    });
  });

  describe('context passed to the provider', () => {
    it('truncates history to the last 30 messages', async () => {
      const provider = createProvider();
      const service = build(provider);
      const history = Array.from({ length: 45 }, (_, index) =>
        message(`m${index}`, `message ${index}`),
      );

      await service.suggestReply('conversation-1', history);

      const [context] = provider.generate.mock.calls[0]!;
      expect(context.messages).toHaveLength(30);
      expect(context.messages[0]!.id).toBe('m15');
      expect(context.messages.at(-1)!.id).toBe('m44');
    });

    it('forwards the instruction and the default persona', async () => {
      const provider = createProvider();
      const service = build(provider);

      await service.suggestReply('conversation-1', [], 'keep it short');

      const [context] = provider.generate.mock.calls[0]!;
      expect(context.instruction).toBe('keep it short');
      expect(context.persona).toContain('answerer in a support conversation');
    });

    it('uses AI_PERSONA when it is configured', async () => {
      const provider = createProvider();
      const service = build(provider, createConfig({ AI_PERSONA: 'Speak like a pirate.' }));

      await service.suggestReply('conversation-1', []);

      const [context] = provider.generate.mock.calls[0]!;
      expect(context.persona).toBe('Speak like a pirate.');
    });
  });
});

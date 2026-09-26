import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AiSuggestion } from '../src/ai/ai-provider.interface.js';
import type { Conversation, ConversationState, Message } from '../src/chat/contracts/models.js';
import { createTestApp, type TestApp } from './app.factory.js';

describe('conversations REST API (e2e)', () => {
  let harness: TestApp;

  beforeAll(async () => {
    harness = await createTestApp();
  });

  afterAll(async () => {
    await harness.close();
  });

  async function createConversation(title?: string): Promise<Conversation> {
    const response = await request(harness.url)
      .post('/api/conversations')
      .send(title ? { title } : {})
      .expect(201);
    return response.body as Conversation;
  }

  function send(conversationId: string, content: string) {
    return request(harness.url)
      .post(`/api/conversations/${conversationId}/messages`)
      .send({ sender: 'user', content, mode: 'manual' });
  }

  describe('POST /api/conversations', () => {
    it('creates a conversation with both participants', async () => {
      const conversation = await createConversation('Billing question');

      expect(conversation.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(conversation.title).toBe('Billing question');
      expect([...conversation.participants].sort()).toEqual(['answerer', 'user']);
    });

    it('rejects a title over the length limit', async () => {
      await request(harness.url)
        .post('/api/conversations')
        .send({ title: 'x'.repeat(121) })
        .expect(400);
    });
  });

  describe('GET /api/conversations/:id/state', () => {
    it('returns an empty snapshot for a fresh conversation', async () => {
      const conversation = await createConversation();

      const response = await request(harness.url)
        .get(`/api/conversations/${conversation.id}/state`)
        .expect(200);
      const state = response.body as ConversationState;

      expect(state.conversation.id).toBe(conversation.id);
      expect(state.messages).toEqual([]);
      expect(state.answererMode).toBe('manual');
      expect(state.online).toEqual([]);
      expect(state.typing).toEqual([]);
    });

    it('404s for an unknown conversation', async () => {
      await request(harness.url).get('/api/conversations/not-a-real-id/state').expect(404);
    });
  });

  describe('POST /api/conversations/:id/messages', () => {
    it('stores the message and echoes it back', async () => {
      const conversation = await createConversation();

      const response = await send(conversation.id, 'first message').expect(201);
      const message = response.body as Message;

      expect(message.content).toBe('first message');
      expect(message.status).toBe('sent');
      expect(message.conversationId).toBe(conversation.id);
    });

    it('rejects empty content', async () => {
      const conversation = await createConversation();
      await send(conversation.id, '').expect(400);
    });

    it('rejects content over the length limit', async () => {
      const conversation = await createConversation();
      await send(conversation.id, 'x'.repeat(4001)).expect(400);
    });

    it('rejects an unknown sender role', async () => {
      const conversation = await createConversation();
      await request(harness.url)
        .post(`/api/conversations/${conversation.id}/messages`)
        .send({ sender: 'intruder', content: 'hello', mode: 'manual' })
        .expect(400);
    });

    it('404s for an unknown conversation', async () => {
      await send('not-a-real-id', 'hello').expect(404);
    });
  });

  describe('GET /api/conversations/:id/messages', () => {
    it('honours the limit query parameter', async () => {
      const conversation = await createConversation();
      await send(conversation.id, 'one');
      await send(conversation.id, 'two');
      await send(conversation.id, 'three');

      const response = await request(harness.url)
        .get(`/api/conversations/${conversation.id}/messages?limit=2`)
        .expect(200);
      const messages = response.body as Message[];

      expect(messages.map((entry) => entry.content)).toEqual(['two', 'three']);
    });

    it('rejects a non-numeric limit', async () => {
      const conversation = await createConversation();
      await request(harness.url)
        .get(`/api/conversations/${conversation.id}/messages?limit=abc`)
        .expect(400);
    });
  });

  describe('POST /api/conversations/:id/suggestions', () => {
    it('returns a draft without sending when autoSend is absent', async () => {
      const conversation = await createConversation();
      await send(conversation.id, 'my order has not arrived');

      const response = await request(harness.url)
        .post(`/api/conversations/${conversation.id}/suggestions`)
        .send({})
        .expect(201);
      const body = response.body as { suggestion: AiSuggestion; sent?: Message };

      expect(body.suggestion.content).toBeTruthy();
      expect(body.suggestion.provider).toBe('mock');
      expect(body.sent).toBeUndefined();

      const history = await request(harness.url)
        .get(`/api/conversations/${conversation.id}/messages`)
        .expect(200);
      expect(history.body as Message[]).toHaveLength(1);
    });

    it('appends an AI message when autoSend is true', async () => {
      const conversation = await createConversation();
      await send(conversation.id, 'my order has not arrived');

      const response = await request(harness.url)
        .post(`/api/conversations/${conversation.id}/suggestions`)
        .send({ autoSend: true })
        .expect(201);
      const body = response.body as { suggestion: AiSuggestion; sent?: Message };

      expect(body.sent).toBeDefined();
      expect(body.sent!.mode).toBe('ai');
      expect(body.sent!.sender).toBe('answerer');
      expect(body.sent!.generatedBy).toBe('mock');
    });

    it('rejects an over-long instruction', async () => {
      const conversation = await createConversation();
      await request(harness.url)
        .post(`/api/conversations/${conversation.id}/suggestions`)
        .send({ instruction: 'x'.repeat(501) })
        .expect(400);
    });
  });

  describe('GET /api/ai/provider', () => {
    it('reports the active provider', async () => {
      const response = await request(harness.url).get('/api/ai/provider').expect(200);

      expect(response.body).toMatchObject({ name: 'mock', configured: true });
    });
  });
});

import request from 'supertest';
import type { Socket } from 'socket.io-client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ClientEvents,
  ServerEvents,
  type MessageNewEvent,
  type MessageReceiptEvent,
  type MessageUpdatedEvent,
  type MutateMessageAck,
  type AnswererModeChangedEvent,
  type PresenceUpdateEvent,
  type TypingUpdateEvent,
} from '../src/chat/contracts/chat-events.js';
import type { Conversation, ConversationState, Message } from '../src/chat/contracts/models.js';
import { createTestApp, nextEvent, noEventWithin, type TestApp } from './app.factory.js';

describe('chat flow (e2e)', () => {
  let harness: TestApp;
  let conversation: Conversation;
  let userSocket: Socket;
  let answererSocket: Socket;

  beforeAll(async () => {
    harness = await createTestApp();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    const response = await request(harness.url).post('/api/conversations').send({});
    conversation = response.body as Conversation;

    const user = await harness.join(conversation.id, 'user');
    const answerer = await harness.join(conversation.id, 'answerer');
    userSocket = user.socket;
    answererSocket = answerer.socket;

    expect(user.ack.ok).toBe(true);
    expect(answerer.ack.ok).toBe(true);
  });

  it('delivers a message POSTed over REST to the other panel over the socket', async () => {
    const received = nextEvent<MessageNewEvent>(answererSocket, ServerEvents.MessageNew);

    const response = await request(harness.url)
      .post(`/api/conversations/${conversation.id}/messages`)
      .send({ sender: 'user', content: 'Hello from REST', mode: 'manual' })
      .expect(201);

    const broadcast = await received;

    expect(broadcast.message.id).toBe((response.body as Message).id);
    expect(broadcast.message.content).toBe('Hello from REST');
    expect(broadcast.message.sender).toBe('user');
  });

  it('gives the joining client a state snapshot naming both participants', async () => {
    const socket = await harness.connect();
    const snapshot = nextEvent<ConversationState>(socket, ServerEvents.ConversationState);

    socket.emit(ClientEvents.JoinConversation, { conversationId: conversation.id, role: 'user' });

    const state = await snapshot;
    expect(state.conversation.id).toBe(conversation.id);
    expect([...state.online].sort()).toEqual(['answerer', 'user']);
    expect(state.answererMode).toBe('manual');
  });

  it('propagates typing start and stop', async () => {
    const started = nextEvent<TypingUpdateEvent>(answererSocket, ServerEvents.TypingUpdate);
    userSocket.emit(ClientEvents.TypingStart, { conversationId: conversation.id, role: 'user' });
    expect((await started).typing).toEqual(['user']);

    const stopped = nextEvent<TypingUpdateEvent>(answererSocket, ServerEvents.TypingUpdate);
    userSocket.emit(ClientEvents.TypingStop, { conversationId: conversation.id, role: 'user' });
    expect((await stopped).typing).toEqual([]);
  });

  it('returns a read receipt to the sender', async () => {
    const delivered = await request(harness.url)
      .post(`/api/conversations/${conversation.id}/messages`)
      .send({ sender: 'user', content: 'Please read this', mode: 'manual' })
      .expect(201);
    const message = delivered.body as Message;

    const receipt = nextEvent<MessageReceiptEvent>(userSocket, ServerEvents.MessageReceipt);
    answererSocket.emit(ClientEvents.MarkRead, {
      conversationId: conversation.id,
      role: 'answerer',
      messageIds: [message.id],
    });

    const event = await receipt;
    expect(event.messageIds).toContain(message.id);
    expect(event.status).toBe('read');
    expect(event.by).toBe('answerer');
  });

  it('syncs the answerer compose mode to both panels', async () => {
    const atUser = nextEvent<AnswererModeChangedEvent>(
      userSocket,
      ServerEvents.AnswererModeChanged,
    );
    const atAnswerer = nextEvent<AnswererModeChangedEvent>(
      answererSocket,
      ServerEvents.AnswererModeChanged,
    );

    answererSocket.emit(ClientEvents.ChangeAnswererMode, {
      conversationId: conversation.id,
      mode: 'ai',
    });

    expect((await atUser).mode).toBe('ai');
    expect((await atAnswerer).mode).toBe('ai');
  });

  it('broadcasts an edit to the other panel', async () => {
    const created = await request(harness.url)
      .post(`/api/conversations/${conversation.id}/messages`)
      .send({ sender: 'user', content: 'origainl typo', mode: 'manual' })
      .expect(201);
    const message = created.body as Message;

    const updated = nextEvent<MessageUpdatedEvent>(answererSocket, ServerEvents.MessageUpdated);
    const ack = (await userSocket.emitWithAck(ClientEvents.EditMessage, {
      conversationId: conversation.id,
      messageId: message.id,
      role: 'user',
      content: 'original typo fixed',
    })) as MutateMessageAck;

    expect(ack.ok).toBe(true);
    expect((await updated).message.content).toBe('original typo fixed');
  });

  it('refuses an edit of a message the caller did not send, and broadcasts nothing', async () => {
    const created = await request(harness.url)
      .post(`/api/conversations/${conversation.id}/messages`)
      .send({ sender: 'user', content: 'mine, not yours', mode: 'manual' })
      .expect(201);
    const message = created.body as Message;

    const quiet = noEventWithin(userSocket, ServerEvents.MessageUpdated);
    const ack = (await answererSocket.emitWithAck(ClientEvents.EditMessage, {
      conversationId: conversation.id,
      messageId: message.id,
      role: 'answerer',
      content: 'hijacked',
    })) as MutateMessageAck;

    expect(ack.ok).toBe(false);
    expect(ack.error).toMatch(/cannot edit/i);
    expect(await quiet).toBe(true);
  });

  it('leaves a tombstone when a message is deleted', async () => {
    const created = await request(harness.url)
      .post(`/api/conversations/${conversation.id}/messages`)
      .send({ sender: 'user', content: 'delete me', mode: 'manual' })
      .expect(201);
    const message = created.body as Message;

    const updated = nextEvent<MessageUpdatedEvent>(answererSocket, ServerEvents.MessageUpdated);
    const ack = (await userSocket.emitWithAck(ClientEvents.DeleteMessage, {
      conversationId: conversation.id,
      messageId: message.id,
      role: 'user',
    })) as MutateMessageAck;

    expect(ack.ok).toBe(true);
    const tombstone = (await updated).message;
    expect(tombstone.content).toBe('');
    expect(tombstone.deletedAt).toBeDefined();
  });

  it('tells the remaining panel when the other one disconnects', async () => {
    const presence = nextEvent<PresenceUpdateEvent>(userSocket, ServerEvents.PresenceUpdate);
    answererSocket.disconnect();

    expect((await presence).online).toEqual(['user']);
  });
});

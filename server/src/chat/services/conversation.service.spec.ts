import { ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiSuggestion } from '../../ai/ai-provider.interface.js';
import type { AiService } from '../../ai/ai.service.js';
import type { Message } from '../contracts/models.js';
import type { ChatBroadcastService } from './chat-broadcast.service.js';
import { ConversationService } from './conversation.service.js';
import { MessageStore } from './message-store.service.js';
import { PresenceService } from './presence.service.js';

function createBroadcastSpy() {
  return {
    attach: vi.fn(),
    messageCreated: vi.fn(),
    messageUpdated: vi.fn(),
    typingChanged: vi.fn(),
    answererModeChanged: vi.fn(),
    presenceChanged: vi.fn(),
    receipts: vi.fn(),
    aiGenerating: vi.fn(),
  };
}

const SUGGESTION: AiSuggestion = {
  content: 'Generated reply',
  provider: 'mock',
  model: 'heuristic-v1',
  latencyMs: 5,
};

describe('ConversationService', () => {
  let store: MessageStore;
  let presence: PresenceService;
  let broadcast: ReturnType<typeof createBroadcastSpy>;
  let ai: { suggestReply: ReturnType<typeof vi.fn>; describeProvider: ReturnType<typeof vi.fn> };
  let service: ConversationService;
  let conversationId: string;

  beforeEach(() => {
    store = new MessageStore();
    presence = new PresenceService();
    broadcast = createBroadcastSpy();
    ai = {
      suggestReply: vi.fn().mockResolvedValue(SUGGESTION),
      describeProvider: vi.fn(),
    };

    service = new ConversationService(
      store,
      presence,
      broadcast as unknown as ChatBroadcastService,
      ai as unknown as AiService,
    );
    conversationId = service.createConversation().id;
  });

  function sendAsUser(content = 'hello'): Message {
    return service.sendMessage({ conversationId, sender: 'user', content, mode: 'manual' });
  }

  describe('sendMessage', () => {
    it('trims the content and broadcasts the new message', () => {
      const message = sendAsUser('  padded  ');

      expect(message.content).toBe('padded');
      expect(broadcast.messageCreated).toHaveBeenCalledWith(message);
    });

    it('clears the sender typing indicator', () => {
      service.setTyping(conversationId, 'user', true);
      broadcast.typingChanged.mockClear();

      sendAsUser();

      expect(broadcast.typingChanged).toHaveBeenCalledWith(conversationId, []);
    });

    it('does not mark delivered when nobody else is online', () => {
      presence.join(conversationId, 'socket-user', 'user');

      const message = sendAsUser();

      expect(broadcast.receipts).not.toHaveBeenCalled();
      expect(store.requireMessage(conversationId, message.id).status).toBe('sent');
    });

    it('marks delivered once a counterpart is online', () => {
      presence.join(conversationId, 'socket-user', 'user');
      presence.join(conversationId, 'socket-answerer', 'answerer');

      const message = sendAsUser();

      expect(broadcast.receipts).toHaveBeenCalledWith(
        conversationId,
        [message.id],
        'delivered',
        'answerer',
      );
      expect(store.requireMessage(conversationId, message.id).status).toBe('delivered');
    });
  });

  describe('editMessage', () => {
    it('rejects editing a message sent by the other role', () => {
      const message = sendAsUser();

      expect(() => service.editMessage(conversationId, message.id, 'answerer', 'nope')).toThrow(
        ForbiddenException,
      );
      expect(broadcast.messageUpdated).not.toHaveBeenCalled();
    });

    it('rejects editing an already deleted message', () => {
      const message = sendAsUser();
      service.deleteMessage(conversationId, message.id, 'user');

      expect(() => service.editMessage(conversationId, message.id, 'user', 'again')).toThrow(
        ForbiddenException,
      );
    });

    it('broadcasts the update on success', () => {
      const message = sendAsUser();
      const edited = service.editMessage(conversationId, message.id, 'user', ' fixed ');

      expect(edited.content).toBe('fixed');
      expect(broadcast.messageUpdated).toHaveBeenCalledWith(edited);
    });
  });

  describe('deleteMessage', () => {
    it('rejects deleting a message sent by the other role', () => {
      const message = sendAsUser();

      expect(() => service.deleteMessage(conversationId, message.id, 'answerer')).toThrow(
        ForbiddenException,
      );
    });
  });

  describe('generateSuggestion', () => {
    it('returns the suggestion without sending when autoSend is off', async () => {
      const result = await service.generateSuggestion(conversationId);

      expect(result.suggestion).toEqual(SUGGESTION);
      expect(result.sent).toBeUndefined();
      expect(store.listMessages(conversationId)).toHaveLength(0);
    });

    it('appends an AI message when autoSend is on', async () => {
      const result = await service.generateSuggestion(conversationId, undefined, true);

      expect(result.sent).toBeDefined();
      expect(result.sent!.mode).toBe('ai');
      expect(result.sent!.sender).toBe('answerer');
      expect(result.sent!.generatedBy).toBe('mock');
    });

    it('brackets the call with generating and typing signals', async () => {
      await service.generateSuggestion(conversationId);

      expect(broadcast.aiGenerating.mock.calls).toEqual([
        [conversationId, true],
        [conversationId, false],
      ]);
      expect(broadcast.typingChanged.mock.calls).toEqual([
        [conversationId, ['answerer']],
        [conversationId, []],
      ]);
    });

    it('clears generating and typing even when the provider throws', async () => {
      ai.suggestReply.mockRejectedValue(new Error('provider exploded'));

      await expect(service.generateSuggestion(conversationId)).rejects.toThrow('provider exploded');

      expect(broadcast.aiGenerating).toHaveBeenLastCalledWith(conversationId, false);
      expect(broadcast.typingChanged).toHaveBeenLastCalledWith(conversationId, []);
      expect(presence.typing(conversationId)).toEqual([]);
    });

    it('excludes deleted messages from the history handed to the provider', async () => {
      const kept = sendAsUser('keep me');
      const removed = sendAsUser('delete me');
      service.deleteMessage(conversationId, removed.id, 'user');

      await service.generateSuggestion(conversationId, 'be brief');

      const [, history, instruction] = ai.suggestReply.mock.calls[0]!;
      expect((history as Message[]).map((message) => message.id)).toEqual([kept.id]);
      expect(instruction).toBe('be brief');
    });
  });

  describe('getState', () => {
    it('reports the conversation, history, mode and presence together', () => {
      presence.join(conversationId, 'socket-user', 'user');
      service.setAnswererMode(conversationId, 'ai');
      const message = sendAsUser();

      const state = service.getState(conversationId);

      expect(state.conversation.id).toBe(conversationId);
      expect(state.messages.map((entry) => entry.id)).toEqual([message.id]);
      expect(state.answererMode).toBe('ai');
      expect(state.online).toEqual(['user']);
    });
  });

  describe('connection lifecycle', () => {
    it('broadcasts presence when a connection registers and unregisters', () => {
      service.registerConnection(conversationId, 'socket-user', 'user');
      expect(broadcast.presenceChanged).toHaveBeenLastCalledWith(conversationId, ['user']);

      service.unregisterConnection(conversationId, 'socket-user');
      expect(broadcast.presenceChanged).toHaveBeenLastCalledWith(conversationId, []);
    });

    it('unregisters a connection from every conversation it joined', () => {
      const second = service.createConversation().id;
      service.registerConnection(conversationId, 'socket-user', 'user');
      service.registerConnection(second, 'socket-user', 'user');

      service.unregisterEverywhere('socket-user');

      expect(presence.online(conversationId)).toEqual([]);
      expect(presence.online(second)).toEqual([]);
    });
  });
});

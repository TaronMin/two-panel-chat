import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';
import { MessageStore } from './message-store.service.js';

describe('MessageStore', () => {
  let store: MessageStore;
  let conversationId: string;

  beforeEach(() => {
    store = new MessageStore();
    conversationId = store.createConversation().id;
  });

  function append(content: string, sender: 'user' | 'answerer' = 'user') {
    return store.appendMessage({ conversationId, sender, content, mode: 'manual' });
  }

  describe('createConversation', () => {
    it('falls back to a default title when none is given', () => {
      expect(store.createConversation().title).toBe('New conversation');
      expect(store.createConversation('   ').title).toBe('New conversation');
      expect(store.createConversation(' Billing ').title).toBe('Billing');
    });

    it('lists conversations newest first', () => {
      const store2 = new MessageStore();
      const first = store2.createConversation('first');
      const second = { ...store2.createConversation('second'), createdAt: '2999-01-01T00:00:00Z' };
      store2.requireConversation(second.id).createdAt = second.createdAt;

      expect(store2.listConversations().map((entry) => entry.id)).toEqual([second.id, first.id]);
    });
  });

  describe('appendMessage', () => {
    it('assigns an id and starts at sent', () => {
      const message = append('hello');

      expect(message.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(message.status).toBe('sent');
      expect(message.conversationId).toBe(conversationId);
    });

    it('omits generatedBy unless one is supplied', () => {
      expect('generatedBy' in append('hello')).toBe(false);

      const generated = store.appendMessage({
        conversationId,
        sender: 'answerer',
        content: 'hi',
        mode: 'ai',
        generatedBy: 'groq',
      });
      expect(generated.generatedBy).toBe('groq');
    });

    it('rejects an unknown conversation', () => {
      expect(() =>
        store.appendMessage({
          conversationId: 'nope',
          sender: 'user',
          content: 'hello',
          mode: 'manual',
        }),
      ).toThrow(NotFoundException);
    });
  });

  describe('editMessage', () => {
    it('replaces the content and stamps editedAt', () => {
      const original = append('typo');
      const edited = store.editMessage(conversationId, original.id, 'fixed');

      expect(edited.content).toBe('fixed');
      expect(edited.editedAt).toBeDefined();
    });
  });

  describe('deleteMessage', () => {
    it('empties the content and leaves a tombstone', () => {
      const message = append('something private');
      const deleted = store.deleteMessage(conversationId, message.id);

      expect(deleted.content).toBe('');
      expect(deleted.deletedAt).toBeDefined();
    });

    it('drops editedAt so a deleted message does not read as edited', () => {
      const message = append('first');
      store.editMessage(conversationId, message.id, 'second');
      const deleted = store.deleteMessage(conversationId, message.id);

      expect(deleted.editedAt).toBeUndefined();
      expect('editedAt' in deleted).toBe(false);
    });
  });

  describe('markStatus', () => {
    it('returns only the messages whose status actually changed', () => {
      const first = append('one');
      const second = append('two');

      expect(store.markStatus(conversationId, [first.id, second.id], 'read')).toHaveLength(2);
      expect(store.markStatus(conversationId, [first.id, second.id], 'read')).toHaveLength(0);
    });

    it('ignores ids that are not in the conversation', () => {
      append('one');
      expect(store.markStatus(conversationId, ['missing'], 'delivered')).toHaveLength(0);
    });
  });

  describe('listMessages', () => {
    it('returns the last N when a limit is given', () => {
      append('one');
      append('two');
      const third = append('three');

      const limited = store.listMessages(conversationId, 1);
      expect(limited).toHaveLength(1);
      expect(limited[0]!.id).toBe(third.id);
    });

    it('returns everything when the limit is absent or zero', () => {
      append('one');
      append('two');

      expect(store.listMessages(conversationId)).toHaveLength(2);
      expect(store.listMessages(conversationId, 0)).toHaveLength(2);
    });

    it('rejects an unknown conversation', () => {
      expect(() => store.listMessages('nope')).toThrow(NotFoundException);
    });
  });

  describe('requireMessage', () => {
    it('rejects an unknown message', () => {
      expect(() => store.requireMessage(conversationId, 'nope')).toThrow(NotFoundException);
    });
  });
});

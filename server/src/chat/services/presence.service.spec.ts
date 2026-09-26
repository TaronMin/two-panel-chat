import { beforeEach, describe, expect, it } from 'vitest';
import { PresenceService } from './presence.service.js';

const CONVERSATION = 'conversation-1';

describe('PresenceService', () => {
  let presence: PresenceService;

  beforeEach(() => {
    presence = new PresenceService();
  });

  describe('online', () => {
    it('is empty for a conversation nobody has joined', () => {
      expect(presence.online(CONVERSATION)).toEqual([]);
    });

    it('de-duplicates two connections held by the same role', () => {
      presence.join(CONVERSATION, 'socket-a', 'user');
      presence.join(CONVERSATION, 'socket-b', 'user');

      expect(presence.online(CONVERSATION)).toEqual(['user']);
    });

    it('lists both roles once each side is connected', () => {
      presence.join(CONVERSATION, 'socket-a', 'user');
      presence.join(CONVERSATION, 'socket-b', 'answerer');

      expect([...presence.online(CONVERSATION)].sort()).toEqual(['answerer', 'user']);
    });
  });

  describe('leave', () => {
    it('keeps a role online while another of its connections remains', () => {
      presence.join(CONVERSATION, 'socket-a', 'user');
      presence.join(CONVERSATION, 'socket-b', 'user');

      presence.leave(CONVERSATION, 'socket-a');

      expect(presence.online(CONVERSATION)).toEqual(['user']);
    });

    it('keeps typing state while another connection for that role remains', () => {
      presence.join(CONVERSATION, 'socket-a', 'user');
      presence.join(CONVERSATION, 'socket-b', 'user');
      presence.setTyping(CONVERSATION, 'user', true);

      presence.leave(CONVERSATION, 'socket-a');

      expect(presence.typing(CONVERSATION)).toEqual(['user']);
    });

    it('clears typing when the last connection for that role goes', () => {
      presence.join(CONVERSATION, 'socket-a', 'user');
      presence.setTyping(CONVERSATION, 'user', true);

      presence.leave(CONVERSATION, 'socket-a');

      expect(presence.typing(CONVERSATION)).toEqual([]);
      expect(presence.online(CONVERSATION)).toEqual([]);
    });

    it('does nothing for a conversation that was never joined', () => {
      expect(() => presence.leave('unknown', 'socket-a')).not.toThrow();
    });
  });

  describe('leaveAll', () => {
    it('returns exactly the conversations that connection was in', () => {
      presence.join('conversation-1', 'socket-a', 'user');
      presence.join('conversation-2', 'socket-a', 'user');
      presence.join('conversation-3', 'socket-b', 'user');

      expect([...presence.leaveAll('socket-a')].sort()).toEqual([
        'conversation-1',
        'conversation-2',
      ]);
      expect(presence.online('conversation-3')).toEqual(['user']);
    });

    it('clears typing in every conversation it removes the last connection from', () => {
      presence.join('conversation-1', 'socket-a', 'answerer');
      presence.setTyping('conversation-1', 'answerer', true);

      presence.leaveAll('socket-a');

      expect(presence.typing('conversation-1')).toEqual([]);
    });

    it('returns nothing for an unknown connection', () => {
      presence.join(CONVERSATION, 'socket-a', 'user');
      expect(presence.leaveAll('socket-z')).toEqual([]);
    });
  });

  describe('setTyping', () => {
    it('adds and removes the role, returning the current set', () => {
      expect(presence.setTyping(CONVERSATION, 'user', true)).toEqual(['user']);
      expect(presence.setTyping(CONVERSATION, 'user', false)).toEqual([]);
    });

    it('is idempotent', () => {
      presence.setTyping(CONVERSATION, 'user', true);
      expect(presence.setTyping(CONVERSATION, 'user', true)).toEqual(['user']);
    });
  });

  describe('answerer mode', () => {
    it('defaults to manual for a conversation never seen before', () => {
      expect(presence.getAnswererMode('brand-new')).toBe('manual');
    });

    it('round-trips a change', () => {
      expect(presence.setAnswererMode(CONVERSATION, 'ai')).toBe('ai');
      expect(presence.getAnswererMode(CONVERSATION)).toBe('ai');
    });

    it('survives every connection leaving', () => {
      presence.join(CONVERSATION, 'socket-a', 'answerer');
      presence.setAnswererMode(CONVERSATION, 'ai');
      presence.leave(CONVERSATION, 'socket-a');

      expect(presence.getAnswererMode(CONVERSATION)).toBe('ai');
    });
  });
});

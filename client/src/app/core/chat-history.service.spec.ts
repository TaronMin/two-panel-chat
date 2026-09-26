import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Observable, throwError } from 'rxjs';
import { ChatApiService } from './chat-api.service';
import { ChatHistoryService } from './chat-history.service';
import type { Conversation, ConversationState, Message, SenderRole } from './contracts';

function conversation(id: string, createdAt = '2026-01-01T10:00:00.000Z'): Conversation {
  return { id, title: 'Chat', createdAt, participants: ['user', 'answerer'] };
}

function message(
  id: string,
  sender: SenderRole,
  content: string,
  createdAt: string,
  overrides: Partial<Message> = {},
): Message {
  return {
    id,
    conversationId: 'ignored',
    sender,
    content,
    mode: 'manual',
    createdAt,
    status: 'sent',
    ...overrides,
  };
}

function state(id: string, messages: Message[], createdAt?: string): ConversationState {
  return {
    conversation: conversation(id, createdAt),
    messages,
    answererMode: 'manual',
    typing: [],
    online: [],
  };
}

class FakeChatApi {
  states = new Map<string, ConversationState>();
  failures = new Map<string, unknown>();
  requested: string[] = [];

  getState(conversationId: string): Observable<ConversationState> {
    this.requested.push(conversationId);
    const failure = this.failures.get(conversationId);
    if (failure) {
      return throwError(() => failure);
    }
    const found = this.states.get(conversationId);
    return new Observable<ConversationState>((subscriber) => {
      subscriber.next(found!);
      subscriber.complete();
    });
  }
}

describe('ChatHistoryService', () => {
  let api: FakeChatApi;
  let history: ChatHistoryService;

  function build(): ChatHistoryService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: ChatApiService, useValue: api }],
    });
    return TestBed.inject(ChatHistoryService);
  }

  function seed(id: string, createdAt = '2026-01-01T10:00:00.000Z'): void {
    history.track(id, [message('seed-' + id, 'user', 'seed message', createdAt)], 'Chat');
  }

  beforeEach(() => {
    localStorage.clear();
    api = new FakeChatApi();
    history = build();
  });

  describe('track', () => {
    it('starts empty', () => {
      expect(history.summaries()).toEqual([]);
      expect(history.count()).toBe(0);
    });

    it('creates no entry for a conversation with no messages', () => {
      history.track('c1', [], 'Chat');

      expect(history.summaries()).toEqual([]);
    });

    it('creates no entry when every message is deleted', () => {
      history.track(
        'c1',
        [
          message('m1', 'user', '', '2026-01-01T11:00:00.000Z', {
            deletedAt: '2026-01-01T11:01:00.000Z',
          }),
        ],
        'Chat',
      );

      expect(history.summaries()).toEqual([]);
    });

    it('creates the entry once the first message arrives', () => {
      history.track(
        'c1',
        [message('m1', 'user', 'Hello there', '2026-01-01T11:00:00.000Z')],
        'Chat',
      );

      expect(history.summaries()).toHaveLength(1);
      expect(history.summaries()[0]).toMatchObject({
        id: 'c1',
        label: 'Hello there',
        preview: 'Hello there',
        messageCount: 1,
      });
    });

    it('updates the label and preview as the conversation grows', () => {
      history.track(
        'c1',
        [message('m1', 'user', 'First question', '2026-01-01T11:00:00.000Z')],
        'Chat',
      );
      history.track(
        'c1',
        [
          message('m1', 'user', 'First question', '2026-01-01T11:00:00.000Z'),
          message('m2', 'answerer', 'Here is the answer', '2026-01-01T11:01:00.000Z'),
        ],
        'Chat',
      );

      expect(history.summaries()).toHaveLength(1);
      expect(history.summaries()[0]).toMatchObject({
        label: 'First question',
        preview: 'Here is the answer',
        messageCount: 2,
      });
    });

    it('does not duplicate a conversation it already knows', () => {
      const messages = [message('m1', 'user', 'Hello', '2026-01-01T11:00:00.000Z')];
      history.track('c1', messages, 'Chat');
      history.track('c1', messages, 'Chat');

      expect(history.summaries()).toHaveLength(1);
    });

    it('orders newest first by latest message', () => {
      history.track('older', [message('m1', 'user', 'a', '2026-01-01T10:00:00.000Z')], 'Chat');
      history.track('newer', [message('m2', 'user', 'b', '2026-01-02T10:00:00.000Z')], 'Chat');

      expect(history.summaries().map((entry) => entry.id)).toEqual(['newer', 'older']);
    });

    it('caps the list at 25 entries', () => {
      for (let index = 0; index < 30; index += 1) {
        const stamp = `2026-01-01T10:${String(index).padStart(2, '0')}:00.000Z`;
        history.track(`c${index}`, [message(`m${index}`, 'user', 'hi', stamp)], 'Chat');
      }

      expect(history.summaries()).toHaveLength(25);
      expect(history.summaries()[0]!.id).toBe('c29');
    });
  });

  describe('forget', () => {
    it('drops the entry', () => {
      history.track('c1', [message('m1', 'user', 'a', '2026-01-01T10:00:00.000Z')], 'Chat');
      history.track('c2', [message('m2', 'user', 'b', '2026-01-02T10:00:00.000Z')], 'Chat');

      history.forget('c1');

      expect(history.summaries().map((entry) => entry.id)).toEqual(['c2']);
    });

    it('ignores an unknown id', () => {
      history.track('c1', [message('m1', 'user', 'a', '2026-01-01T10:00:00.000Z')], 'Chat');
      history.forget('nope');

      expect(history.summaries()).toHaveLength(1);
    });

    it('lets the list reach empty', () => {
      history.track('c1', [message('m1', 'user', 'a', '2026-01-01T10:00:00.000Z')], 'Chat');
      history.track('c2', [message('m2', 'user', 'b', '2026-01-02T10:00:00.000Z')], 'Chat');

      history.forget('c1');
      history.forget('c2');

      expect(history.summaries()).toEqual([]);
      expect(build().summaries()).toEqual([]);
    });
  });

  describe('clear', () => {
    it('empties the list and the stored copy', () => {
      history.track('c1', [message('m1', 'user', 'a', '2026-01-01T10:00:00.000Z')], 'Chat');
      history.track('c2', [message('m2', 'user', 'b', '2026-01-02T10:00:00.000Z')], 'Chat');

      history.clear();

      expect(history.summaries()).toEqual([]);
      expect(build().summaries()).toEqual([]);
    });
  });

  describe('persistence', () => {
    it('reloads what a previous instance stored', () => {
      seed('c1');

      const reloaded = build();

      expect(reloaded.summaries().map((entry) => entry.id)).toEqual(['c1']);
    });

    it('survives corrupt storage', () => {
      localStorage.setItem('chat.history', 'not json');

      expect(build().summaries()).toEqual([]);
    });

    it('ignores a stored value that is not a list', () => {
      localStorage.setItem('chat.history', '{"id":"c1"}');

      expect(build().summaries()).toEqual([]);
    });
  });

  describe('refresh', () => {
    it('labels a conversation with its first user message', async () => {
      api.states.set(
        'c1',
        state('c1', [
          message('m1', 'user', 'My order has not arrived', '2026-01-01T11:00:00.000Z'),
          message('m2', 'answerer', 'Looking into it', '2026-01-01T11:01:00.000Z'),
        ]),
      );
      seed('c1');

      await history.refresh();

      expect(history.summaries()[0]).toMatchObject({
        label: 'My order has not arrived',
        preview: 'Looking into it',
        messageCount: 2,
      });
    });

    it('collapses whitespace and truncates a long label', async () => {
      const long = 'word '.repeat(40);
      api.states.set('c1', state('c1', [message('m1', 'user', long, '2026-01-01T11:00:00.000Z')]));
      seed('c1');

      await history.refresh();

      const label = history.summaries()[0]!.label;
      expect(label.length).toBeLessThanOrEqual(48);
      expect(label.endsWith('…')).toBe(true);
      expect(label).not.toContain('  ');
    });

    it('ignores deleted messages when labelling', async () => {
      api.states.set(
        'c1',
        state('c1', [
          message('m1', 'user', '', '2026-01-01T11:00:00.000Z', {
            deletedAt: '2026-01-01T11:05:00.000Z',
          }),
          message('m2', 'user', 'The real question', '2026-01-01T11:02:00.000Z'),
        ]),
      );
      seed('c1');

      await history.refresh();

      expect(history.summaries()[0]).toMatchObject({ label: 'The real question', messageCount: 1 });
    });

    it('falls back to the conversation title when the user has not written yet', async () => {
      api.states.set(
        'c1',
        state('c1', [message('m1', 'answerer', 'Hello there', '2026-01-01T11:00:00.000Z')]),
      );
      seed('c1');

      await history.refresh();

      expect(history.summaries()[0]!.label).toBe('Chat');
    });

    it('drops a conversation the server no longer has', async () => {
      api.states.set(
        'kept',
        state('kept', [message('m1', 'user', 'still here', '2026-01-01T10:00:00.000Z')]),
      );
      api.failures.set('gone', new HttpErrorResponse({ status: 404 }));
      seed('kept', '2026-01-01T10:00:00.000Z');
      seed('gone', '2026-01-02T10:00:00.000Z');

      await history.refresh();

      expect(history.summaries().map((entry) => entry.id)).toEqual(['kept']);
    });

    it('prunes an entry whose conversation has no messages left', async () => {
      api.states.set('empty', state('empty', []));
      api.states.set(
        'kept',
        state('kept', [message('m1', 'user', 'still here', '2026-01-02T10:00:00.000Z')]),
      );
      seed('empty', '2026-01-01T10:00:00.000Z');
      seed('kept', '2026-01-02T10:00:00.000Z');

      await history.refresh();

      expect(history.summaries().map((entry) => entry.id)).toEqual(['kept']);
    });

    it('keeps entries when the lookup fails for a reason other than 404', async () => {
      api.failures.set('c1', new HttpErrorResponse({ status: 0 }));
      seed('c1');

      await history.refresh();

      expect(history.summaries().map((entry) => entry.id)).toEqual(['c1']);
    });

    it('makes no requests when the list is empty', async () => {
      await history.refresh();

      expect(api.requested).toEqual([]);
    });

    it('reorders by latest message', async () => {
      api.states.set(
        'quiet',
        state('quiet', [message('m1', 'user', 'old', '2026-01-01T09:00:00.000Z')]),
      );
      api.states.set(
        'busy',
        state('busy', [message('m2', 'user', 'recent', '2026-01-05T09:00:00.000Z')]),
      );
      seed('busy', '2026-01-01T08:00:00.000Z');
      seed('quiet', '2026-01-02T08:00:00.000Z');

      await history.refresh();

      expect(history.summaries().map((entry) => entry.id)).toEqual(['busy', 'quiet']);
    });

    it('clears the refreshing flag when it finishes', async () => {
      api.states.set('c1', state('c1', []));
      seed('c1');

      const pending = history.refresh();
      expect(history.isRefreshing()).toBe(true);

      await pending;
      expect(history.isRefreshing()).toBe(false);
    });
  });

  describe('hasLoaded', () => {
    it('starts false so the list can show a skeleton', () => {
      expect(history.hasLoaded()).toBe(false);
    });

    it('is set once a refresh completes', async () => {
      api.states.set('c1', state('c1', []));
      seed('c1');

      await history.refresh();

      expect(history.hasLoaded()).toBe(true);
    });

    it('is set even when there is nothing to look up', async () => {
      await history.refresh();

      expect(history.hasLoaded()).toBe(true);
    });

    it('is set even when every lookup fails', async () => {
      api.failures.set('c1', new HttpErrorResponse({ status: 500 }));
      seed('c1');

      await history.refresh();

      expect(history.hasLoaded()).toBe(true);
    });
  });
});

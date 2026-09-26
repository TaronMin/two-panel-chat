import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, Subject, throwError } from 'rxjs';
import { ChatApiService } from './chat-api.service';
import { PanelChatService } from './panel-chat.service';
import { SocketService } from './socket.service';
import {
  ServerEvents,
  type ChatServerEvents,
  type ConnectionStatus,
  type ConversationState,
  type Message,
  type MutateMessageAck,
  type SenderRole,
} from './contracts';

const CONVERSATION_ID = 'conv-1';

function message(id: string, sender: SenderRole, overrides: Partial<Message> = {}): Message {
  return {
    id,
    conversationId: CONVERSATION_ID,
    sender,
    content: `content of ${id}`,
    mode: 'manual',
    createdAt: new Date().toISOString(),
    status: 'sent',
    ...overrides,
  };
}

class FakeSocket {
  readonly status = signal<ConnectionStatus>('connected');
  readonly emitted: { event: string; payload: unknown }[] = [];

  private readonly streams = new Map<string, Subject<unknown>>();

  joinAck: MutateMessageAck | { ok: boolean } = { ok: true };
  mutateAck: MutateMessageAck = { ok: true };

  connect(): void {}
  disconnect(): void {}
  leaveConversation(): void {}

  on<TEvent extends keyof ChatServerEvents & string>(
    event: TEvent,
  ): Observable<ChatServerEvents[TEvent]> {
    return this.streamFor(event).asObservable() as Observable<ChatServerEvents[TEvent]>;
  }

  onConnected(handler: () => void): void {
    handler();
  }

  async joinConversation() {
    return this.joinAck;
  }

  setTyping(conversationId: string, role: SenderRole, isTyping: boolean): void {
    this.emitted.push({ event: isTyping ? 'typing:start' : 'typing:stop', payload: { role } });
  }

  changeAnswererMode(conversationId: string, mode: string): void {
    this.emitted.push({ event: 'answerer:mode-change', payload: { mode } });
  }

  markRead(conversationId: string, role: SenderRole, messageIds: string[]): void {
    if (messageIds.length === 0) {
      return;
    }
    this.emitted.push({ event: 'message:read', payload: { messageIds } });
  }

  async editMessage(): Promise<MutateMessageAck> {
    return this.mutateAck;
  }

  async deleteMessage(): Promise<MutateMessageAck> {
    return this.mutateAck;
  }

  emitServerEvent<TEvent extends keyof ChatServerEvents & string>(
    event: TEvent,
    payload: ChatServerEvents[TEvent],
  ): void {
    this.streamFor(event).next(payload);
  }

  private streamFor(event: string): Subject<unknown> {
    let stream = this.streams.get(event);
    if (!stream) {
      stream = new Subject<unknown>();
      this.streams.set(event, stream);
    }
    return stream;
  }
}

class FakeChatApi {
  response: Message | null = null;
  error: Error | null = null;
  calls = 0;

  sendMessage(): Observable<Message> {
    this.calls += 1;
    if (this.error) {
      return throwError(() => this.error);
    }
    return new Observable<Message>((subscriber) => {
      subscriber.next(this.response!);
      subscriber.complete();
    });
  }
}

describe('PanelChatService', () => {
  let socket: FakeSocket;
  let api: FakeChatApi;
  let chat: PanelChatService;

  beforeEach(async () => {
    socket = new FakeSocket();
    api = new FakeChatApi();

    TestBed.configureTestingModule({
      providers: [
        PanelChatService,
        { provide: SocketService, useValue: socket },
        { provide: ChatApiService, useValue: api },
      ],
    });

    chat = TestBed.inject(PanelChatService);
    await chat.joinConversation(CONVERSATION_ID, 'user');
    await Promise.resolve();
  });

  describe('joinConversation', () => {
    it('marks the panel joined and ready', () => {
      expect(chat.hasJoined()).toBe(true);
      expect(chat.isReady()).toBe(true);
    });

    it('is not ready while the socket is down', () => {
      socket.status.set('reconnecting');
      expect(chat.isReady()).toBe(false);
    });
  });

  describe('message de-duplication', () => {
    it('does not append a second copy when the broadcast echoes the POST response', async () => {
      const sent = message('m1', 'user');
      api.response = sent;

      expect(await chat.sendMessage('hello', 'manual')).toBe(true);
      expect(chat.messages()).toHaveLength(1);

      socket.emitServerEvent(ServerEvents.MessageNew, { message: sent });

      expect(chat.messages()).toHaveLength(1);
      expect(chat.messages()[0]!.id).toBe('m1');
    });

    it('appends a broadcast for a message it did not send', () => {
      socket.emitServerEvent(ServerEvents.MessageNew, { message: message('m2', 'answerer') });

      expect(chat.messages().map((entry) => entry.id)).toEqual(['m2']);
    });
  });

  describe('sendMessage', () => {
    it('refuses blank content without calling the API', async () => {
      expect(await chat.sendMessage('   ', 'manual')).toBe(false);
      expect(api.calls).toBe(0);
    });

    it('trims before sending', async () => {
      api.response = message('m1', 'user');
      await chat.sendMessage('  padded  ', 'manual');

      expect(chat.messages()).toHaveLength(1);
    });

    it('surfaces a transport failure as sendError', async () => {
      api.error = new Error('Could not reach the server.');

      expect(await chat.sendMessage('hello', 'manual')).toBe(false);
      expect(chat.sendError()).toBe('Could not reach the server.');
      expect(chat.messages()).toHaveLength(0);
    });
  });

  describe('conversation:state', () => {
    it('replaces the whole thread, which is what a reconnect delivers', () => {
      socket.emitServerEvent(ServerEvents.MessageNew, { message: message('stale', 'user') });

      const state: ConversationState = {
        conversation: {
          id: CONVERSATION_ID,
          title: 'Two-panel chat',
          createdAt: new Date().toISOString(),
          participants: ['user', 'answerer'],
        },
        messages: [message('m1', 'user'), message('m2', 'answerer')],
        answererMode: 'ai',
        typing: ['answerer'],
        online: ['user', 'answerer'],
      };
      socket.emitServerEvent(ServerEvents.ConversationState, state);

      expect(chat.messages().map((entry) => entry.id)).toEqual(['m1', 'm2']);
      expect(chat.answererMode()).toBe('ai');
      expect(chat.typing()).toEqual(['answerer']);
      expect(chat.online()).toEqual(['user', 'answerer']);
    });
  });

  describe('message:receipt', () => {
    it('updates status in place without reordering', () => {
      socket.emitServerEvent(ServerEvents.MessageNew, { message: message('m1', 'user') });
      socket.emitServerEvent(ServerEvents.MessageNew, { message: message('m2', 'user') });
      socket.emitServerEvent(ServerEvents.MessageNew, { message: message('m3', 'user') });

      socket.emitServerEvent(ServerEvents.MessageReceipt, {
        conversationId: CONVERSATION_ID,
        messageIds: ['m1', 'm3'],
        status: 'read',
        by: 'answerer',
      });

      expect(chat.messages().map((entry) => [entry.id, entry.status])).toEqual([
        ['m1', 'read'],
        ['m2', 'sent'],
        ['m3', 'read'],
      ]);
    });
  });

  describe('message:updated', () => {
    it('replaces the matching message and leaves the rest alone', () => {
      socket.emitServerEvent(ServerEvents.MessageNew, { message: message('m1', 'user') });
      socket.emitServerEvent(ServerEvents.MessageNew, { message: message('m2', 'user') });

      socket.emitServerEvent(ServerEvents.MessageUpdated, {
        message: message('m1', 'user', { content: '', deletedAt: new Date().toISOString() }),
      });

      const [first, second] = chat.messages();
      expect(first!.deletedAt).toBeDefined();
      expect(second!.deletedAt).toBeUndefined();
    });
  });

  describe('ai:generating', () => {
    it('mirrors the server flag', () => {
      socket.emitServerEvent(ServerEvents.AiGenerating, {
        conversationId: CONVERSATION_ID,
        generating: true,
      });
      expect(chat.isGeneratingReply()).toBe(true);

      socket.emitServerEvent(ServerEvents.AiGenerating, {
        conversationId: CONVERSATION_ID,
        generating: false,
      });
      expect(chat.isGeneratingReply()).toBe(false);
    });
  });

  describe('reportComposerActivity', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      socket.emitted.length = 0;
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('announces typing once across many keystrokes', () => {
      chat.reportComposerActivity(true);
      chat.reportComposerActivity(true);
      chat.reportComposerActivity(true);

      expect(socket.emitted.filter((entry) => entry.event === 'typing:start')).toHaveLength(1);
    });

    it('stops typing once the composer empties', () => {
      chat.reportComposerActivity(true);
      chat.reportComposerActivity(false);

      expect(socket.emitted.map((entry) => entry.event)).toEqual(['typing:start', 'typing:stop']);
    });

    it('stops typing after the idle timeout', () => {
      chat.reportComposerActivity(true);
      vi.advanceTimersByTime(1500);

      expect(socket.emitted.map((entry) => entry.event)).toEqual(['typing:start', 'typing:stop']);
    });

    it('does not stop twice', () => {
      chat.reportComposerActivity(true);
      chat.stopTyping();
      chat.stopTyping();

      expect(socket.emitted.filter((entry) => entry.event === 'typing:stop')).toHaveLength(1);
    });
  });

  describe('markCounterpartMessagesRead', () => {
    it('reports only unread messages from the other side', () => {
      socket.emitServerEvent(ServerEvents.MessageNew, { message: message('mine', 'user') });
      socket.emitServerEvent(ServerEvents.MessageNew, { message: message('theirs', 'answerer') });
      socket.emitServerEvent(ServerEvents.MessageNew, {
        message: message('already-read', 'answerer', { status: 'read' }),
      });
      socket.emitted.length = 0;

      chat.markCounterpartMessagesRead();

      expect(socket.emitted).toEqual([
        { event: 'message:read', payload: { messageIds: ['theirs'] } },
      ]);
    });

    it('sends nothing when there is nothing unread', () => {
      socket.emitted.length = 0;
      chat.markCounterpartMessagesRead();

      expect(socket.emitted).toEqual([]);
    });
  });

  describe('editMessage', () => {
    it('applies the acked message', async () => {
      socket.emitServerEvent(ServerEvents.MessageNew, { message: message('m1', 'user') });
      socket.mutateAck = { ok: true, message: message('m1', 'user', { content: 'edited' }) };

      expect(await chat.editMessage('m1', 'edited')).toBe(true);
      expect(chat.messages()[0]!.content).toBe('edited');
    });

    it('refuses blank content', async () => {
      expect(await chat.editMessage('m1', '   ')).toBe(false);
    });

    it('surfaces a rejected ack as sendError', async () => {
      socket.mutateAck = {
        ok: false,
        error: 'The user cannot edit a message sent by someone else.',
      };

      expect(await chat.editMessage('m1', 'nope')).toBe(false);
      expect(chat.sendError()).toContain('cannot edit');
    });
  });
});

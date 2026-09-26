import { Injector, runInInjectionContext, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, Subject } from 'rxjs';
import { ChatApiService } from './chat-api.service';
import { ChatHistoryService } from './chat-history.service';
import { PanelChatService } from './panel-chat.service';
import { SocketService } from './socket.service';
import {
  ServerEvents,
  type ChatServerEvents,
  type ConnectionStatus,
  type Conversation,
  type Message,
  type SenderRole,
} from './contracts';

const CONVERSATION_ID = 'conv-1';

const conversation: Conversation = {
  id: CONVERSATION_ID,
  title: 'Chat',
  createdAt: '2026-01-01T10:00:00.000Z',
  participants: ['user', 'answerer'],
};

function message(id: string, sender: SenderRole, content: string, createdAt: string): Message {
  return {
    id,
    conversationId: CONVERSATION_ID,
    sender,
    content,
    mode: sender === 'answerer' ? 'ai' : 'manual',
    createdAt,
    status: 'sent',
  };
}

class FakeSocket {
  readonly status = signal<ConnectionStatus>('connected');
  private readonly streams = new Map<string, Subject<unknown>>();

  connect(): void {}
  disconnect(): void {}
  leaveConversation(): void {}
  setTyping(): void {}
  changeAnswererMode(): void {}
  markRead(): void {}
  async joinConversation() {
    return { ok: true };
  }
  async editMessage() {
    return { ok: true };
  }
  async deleteMessage() {
    return { ok: true };
  }

  on<TEvent extends keyof ChatServerEvents & string>(
    event: TEvent,
  ): Observable<ChatServerEvents[TEvent]> {
    return this.streamFor(event).asObservable() as Observable<ChatServerEvents[TEvent]>;
  }

  onConnected(handler: () => void): void {
    handler();
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

describe('history tracking with both panels mounted', () => {
  let history: ChatHistoryService;
  let userSocket: FakeSocket;
  let answererSocket: FakeSocket;
  let userPanel: PanelChatService;
  let answererPanel: PanelChatService;
  let writes: number;

  async function buildPanel(socket: FakeSocket, role: SenderRole): Promise<PanelChatService> {
    const injector = Injector.create({
      providers: [
        { provide: SocketService, useValue: socket },
        { provide: ChatApiService, useValue: {} },
        { provide: ChatHistoryService, useValue: history },
        { provide: PanelChatService, useClass: PanelChatService, deps: [] },
      ],
      parent: TestBed.inject(Injector),
    });

    const panel = runInInjectionContext(injector, () => injector.get(PanelChatService));
    await panel.joinConversation(CONVERSATION_ID, role);
    return panel;
  }

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [{ provide: ChatApiService, useValue: {} }] });
    history = TestBed.inject(ChatHistoryService);

    writes = 0;
    const original = history.track.bind(history);
    history.track = (id, messages, title) => {
      writes += 1;
      if (writes > 500) {
        throw new Error(`runaway history tracking: ${writes} calls`);
      }
      original(id, messages, title);
    };

    userSocket = new FakeSocket();
    answererSocket = new FakeSocket();
    userPanel = await buildPanel(userSocket, 'user');
    answererPanel = await buildPanel(answererSocket, 'answerer');
  });

  function broadcast(...messages: Message[]): void {
    for (const socket of [userSocket, answererSocket]) {
      socket.emitServerEvent(ServerEvents.ConversationState, {
        conversation,
        messages,
        answererMode: 'ai',
        typing: [],
        online: ['user', 'answerer'],
        aiGenerating: false,
      });
    }
  }

  function deliver(next: Message, all: Message[]): void {
    for (const socket of [userSocket, answererSocket]) {
      socket.emitServerEvent(ServerEvents.MessageNew, { message: next });
    }
    void all;
  }

  it('settles after both panels receive the same state', () => {
    broadcast(message('m1', 'user', 'Where is my order?', '2026-01-01T11:00:00.000Z'));
    TestBed.tick();

    expect(history.summaries()).toHaveLength(1);
    expect(history.summaries()[0]!.label).toBe('Where is my order?');
  });

  it('settles after an auto-generated answer arrives', () => {
    const first = message('m1', 'user', 'Where is my order?', '2026-01-01T11:00:00.000Z');
    broadcast(first);
    TestBed.tick();

    const reply = message(
      'm2',
      'answerer',
      'Let me check that for you.',
      '2026-01-01T11:00:05.000Z',
    );
    deliver(reply, [first, reply]);
    TestBed.tick();

    expect(history.summaries()).toHaveLength(1);
    expect(history.summaries()[0]).toMatchObject({
      label: 'Where is my order?',
      preview: 'Let me check that for you.',
      messageCount: 2,
    });
    expect(userPanel.messages()).toHaveLength(2);
    expect(answererPanel.messages()).toHaveLength(2);
  });

  it('settles across a rapid burst of messages', () => {
    const all: Message[] = [];
    for (let index = 0; index < 12; index += 1) {
      const next = message(
        `m${index}`,
        index % 2 === 0 ? 'user' : 'answerer',
        `message ${index}`,
        `2026-01-01T11:${String(index).padStart(2, '0')}:00.000Z`,
      );
      all.push(next);
      deliver(next, all);
    }
    TestBed.tick();

    expect(history.summaries()).toHaveLength(1);
    expect(history.summaries()[0]!.messageCount).toBe(12);
  });
});

import { computed, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { ChatApiService } from '../../core/chat-api.service';
import { PanelChatService } from '../../core/panel-chat.service';
import type {
  AiSuggestion,
  ComposeMode,
  ConnectionStatus,
  Message,
  SenderRole,
} from '../../core/contracts';
import { AnswererPanelComponent } from './answerer-panel.component';

const CONVERSATION_ID = 'conv-1';

type SuggestionResult = { suggestion: AiSuggestion; sent?: Message };

function message(id: string, sender: SenderRole): Message {
  return {
    id,
    conversationId: CONVERSATION_ID,
    sender,
    content: `content of ${id}`,
    mode: sender === 'user' ? 'manual' : 'ai',
    createdAt: new Date().toISOString(),
    status: 'sent',
  };
}

class FakePanelChat {
  readonly messages = signal<Message[]>([]);
  readonly typing = signal<SenderRole[]>([]);
  readonly online = signal<SenderRole[]>(['user']);
  readonly answererMode = signal<ComposeMode>('ai');
  readonly isGeneratingReply = signal(false);
  readonly hasJoined = signal(true);
  readonly sendError = signal<string | null>(null);
  readonly status = signal<ConnectionStatus>('connected');
  readonly isReady = computed(() => this.hasJoined() && this.status() === 'connected');

  async joinConversation(): Promise<void> {}
  async sendMessage(): Promise<boolean> {
    return true;
  }
  async editMessage(): Promise<boolean> {
    return true;
  }
  async deleteMessage(): Promise<boolean> {
    return true;
  }
  reportComposerActivity(): void {}
  stopTyping(): void {}
  setAnswererMode(mode: ComposeMode): void {
    this.answererMode.set(mode);
  }
  markCounterpartMessagesRead(): void {}
}

class FakeChatApi {
  readonly pending: Subject<SuggestionResult>[] = [];

  generateSuggestion() {
    const request = new Subject<SuggestionResult>();
    this.pending.push(request);
    return request.asObservable();
  }
}

describe('AnswererPanelComponent auto-answer', () => {
  let chat: FakePanelChat;
  let api: FakeChatApi;
  let fixture: ComponentFixture<AnswererPanelComponent>;

  async function settleUi(): Promise<void> {
    await fixture.whenStable();
    await fixture.whenStable();
  }

  async function enableAutoAnswer(): Promise<void> {
    const toggle = fixture.nativeElement.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement;
    toggle.click();
    await settleUi();
  }

  async function completeGeneration(index: number, replyId: string): Promise<void> {
    const sent = message(replyId, 'answerer');
    chat.messages.update((messages) => [...messages, sent]);
    api.pending[index]!.next({
      suggestion: { content: sent.content, provider: 'mock', latencyMs: 1 },
      sent,
    });
    api.pending[index]!.complete();
    await settleUi();
  }

  async function receiveUserMessage(id: string): Promise<void> {
    chat.messages.update((messages) => [...messages, message(id, 'user')]);
    await settleUi();
  }

  beforeAll(() => {
    Element.prototype.scrollTo = () => {};
  });

  beforeEach(async () => {
    sessionStorage.clear();
    chat = new FakePanelChat();
    api = new FakeChatApi();

    await TestBed.configureTestingModule({
      imports: [AnswererPanelComponent],
      providers: [{ provide: ChatApiService, useValue: api }],
    })
      .overrideComponent(AnswererPanelComponent, {
        set: { providers: [{ provide: PanelChatService, useValue: chat }] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(AnswererPanelComponent);
    fixture.componentRef.setInput('conversationId', CONVERSATION_ID);
    await settleUi();
    await enableAutoAnswer();
  });

  it('answers a message that arrives while the previous reply is still generating', async () => {
    await receiveUserMessage('m1');
    expect(api.pending.length).toBe(1);

    await receiveUserMessage('m2');
    expect(api.pending.length).toBe(1);

    await completeGeneration(0, 'a1');
    expect(api.pending.length).toBe(2);

    await completeGeneration(1, 'a2');
    expect(api.pending.length).toBe(2);
  });

  it('does not re-answer a message once its reply is in the thread', async () => {
    await receiveUserMessage('m1');
    await completeGeneration(0, 'a1');

    expect(api.pending.length).toBe(1);
  });

  it('stops after a failed generation and resumes on the next user message', async () => {
    await receiveUserMessage('m1');
    api.pending[0]!.error(new Error('provider unavailable'));
    await settleUi();

    expect(api.pending.length).toBe(1);
    expect(fixture.nativeElement.textContent).toContain('provider unavailable');

    await receiveUserMessage('m2');
    expect(api.pending.length).toBe(2);
  });
});

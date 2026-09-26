import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { ChatApiService } from './chat-api.service';
import { ChatHistoryService } from './chat-history.service';
import { SocketService } from './socket.service';
import {
  ServerEvents,
  type ComposeMode,
  type Message,
  type MutateMessageAck,
  type SenderRole,
} from './contracts';

const TYPING_IDLE_MS = 1500;

@Injectable()
export class PanelChatService {
  private readonly socket = inject(SocketService);
  private readonly chatApi = inject(ChatApiService);
  private readonly history = inject(ChatHistoryService);
  private readonly destroyRef = inject(DestroyRef);

  readonly messages = signal<Message[]>([]);
  readonly typing = signal<SenderRole[]>([]);
  readonly online = signal<SenderRole[]>([]);
  readonly answererMode = signal<ComposeMode>('manual');
  readonly isGeneratingReply = signal(false);
  readonly hasJoined = signal(false);
  readonly sendError = signal<string | null>(null);
  readonly status = this.socket.status;

  readonly isReady = computed(() => this.hasJoined() && this.status() === 'connected');

  private viewerRole: SenderRole = 'user';
  private conversationId = '';
  private conversationTitle = '';
  private typingTimer: ReturnType<typeof setTimeout> | null = null;
  private isBroadcastingTyping = false;

  constructor() {
    effect(() => {
      const messages = this.messages();
      if (this.conversationId) {
        this.history.track(this.conversationId, messages, this.conversationTitle);
      }
    });
  }

  async joinConversation(conversationId: string, role: SenderRole): Promise<void> {
    this.conversationId = conversationId;
    this.viewerRole = role;

    this.socket.connect();
    this.subscribeToServerEvents();

    this.socket.onConnected(() => {
      void this.socket.joinConversation(conversationId, role).then((ack) => {
        this.hasJoined.set(ack.ok);
      });
    });

    this.destroyRef.onDestroy(() => {
      this.clearTypingTimer();
      this.socket.leaveConversation(conversationId);
      this.socket.disconnect();
    });
  }

  async sendMessage(content: string, mode: ComposeMode, generatedBy?: string): Promise<boolean> {
    const trimmed = content.trim();
    if (!trimmed) {
      return false;
    }

    this.stopTyping();
    this.sendError.set(null);

    try {
      const message = await firstValueFrom(
        this.chatApi.sendMessage(this.conversationId, {
          sender: this.viewerRole,
          content: trimmed,
          mode,
          generatedBy,
        }),
      );
      this.appendMessage(message);
      return true;
    } catch (error) {
      this.sendError.set(error instanceof Error ? error.message : 'Could not reach the server.');
      return false;
    }
  }

  async editMessage(messageId: string, content: string): Promise<boolean> {
    const trimmed = content.trim();
    if (!trimmed) {
      return false;
    }
    return this.sendMutation(() =>
      this.socket.editMessage(this.conversationId, messageId, this.viewerRole, trimmed),
    );
  }

  async deleteMessage(messageId: string): Promise<boolean> {
    return this.sendMutation(() =>
      this.socket.deleteMessage(this.conversationId, messageId, this.viewerRole),
    );
  }

  private async sendMutation(send: () => Promise<MutateMessageAck>): Promise<boolean> {
    this.sendError.set(null);
    try {
      const ack = await send();
      if (!ack.ok || !ack.message) {
        this.sendError.set(ack.error ?? 'The server rejected that change.');
        return false;
      }
      this.replaceMessage(ack.message);
      return true;
    } catch (error) {
      this.sendError.set(error instanceof Error ? error.message : 'Could not reach the server.');
      return false;
    }
  }

  reportComposerActivity(hasText: boolean): void {
    if (!hasText) {
      this.stopTyping();
      return;
    }
    if (!this.isBroadcastingTyping) {
      this.isBroadcastingTyping = true;
      this.socket.setTyping(this.conversationId, this.viewerRole, true);
    }
    this.clearTypingTimer();
    this.typingTimer = setTimeout(() => this.stopTyping(), TYPING_IDLE_MS);
  }

  stopTyping(): void {
    this.clearTypingTimer();
    if (this.isBroadcastingTyping) {
      this.isBroadcastingTyping = false;
      this.socket.setTyping(this.conversationId, this.viewerRole, false);
    }
  }

  setAnswererMode(mode: ComposeMode): void {
    this.socket.changeAnswererMode(this.conversationId, mode);
  }

  markCounterpartMessagesRead(): void {
    const unread = this.messages()
      .filter((message) => message.sender !== this.viewerRole && message.status !== 'read')
      .map((message) => message.id);
    this.socket.markRead(this.conversationId, this.viewerRole, unread);
  }

  private appendMessage(message: Message): void {
    this.messages.update((messages) =>
      messages.some((existing) => existing.id === message.id) ? messages : [...messages, message],
    );
  }

  private replaceMessage(message: Message): void {
    this.messages.update((messages) =>
      messages.map((existing) => (existing.id === message.id ? message : existing)),
    );
  }

  private subscribeToServerEvents(): void {
    this.socket
      .on(ServerEvents.ConversationState)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((state) => {
        this.conversationTitle = state.conversation.title;
        this.messages.set(state.messages);
        this.typing.set(state.typing);
        this.online.set(state.online);
        this.answererMode.set(state.answererMode);
      });

    this.socket
      .on(ServerEvents.MessageNew)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ message }) => this.appendMessage(message));

    this.socket
      .on(ServerEvents.MessageUpdated)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ message }) => this.replaceMessage(message));

    this.socket
      .on(ServerEvents.TypingUpdate)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => this.typing.set(event.typing));

    this.socket
      .on(ServerEvents.PresenceUpdate)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => this.online.set(event.online));

    this.socket
      .on(ServerEvents.AnswererModeChanged)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => this.answererMode.set(event.mode));

    this.socket
      .on(ServerEvents.AiGenerating)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => this.isGeneratingReply.set(event.generating));

    this.socket
      .on(ServerEvents.MessageReceipt)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => {
        const ids = new Set(event.messageIds);
        this.messages.update((messages) =>
          messages.map((message) =>
            ids.has(message.id) ? { ...message, status: event.status } : message,
          ),
        );
      });
  }

  private clearTypingTimer(): void {
    if (this.typingTimer) {
      clearTimeout(this.typingTimer);
      this.typingTimer = null;
    }
  }
}

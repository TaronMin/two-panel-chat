import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { ChatApiService } from './chat-api.service';
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
  private readonly api = inject(ChatApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly messages = signal<Message[]>([]);
  readonly typing = signal<SenderRole[]>([]);
  readonly online = signal<SenderRole[]>([]);
  readonly answererMode = signal<ComposeMode>('manual');
  readonly aiGenerating = signal(false);
  readonly joined = signal(false);
  readonly sendError = signal<string | null>(null);
  readonly status = this.socket.status;

  readonly ready = computed(() => this.joined() && this.status() === 'connected');

  private role: SenderRole = 'user';
  private conversationId = '';
  private typingTimer: ReturnType<typeof setTimeout> | null = null;
  private typingActive = false;

  async init(conversationId: string, role: SenderRole): Promise<void> {
    this.conversationId = conversationId;
    this.role = role;

    this.socket.connect();
    this.subscribe();

    this.socket.onConnected(() => {
      void this.socket.joinConversation(conversationId, role).then((ack) => {
        this.joined.set(ack.ok);
      });
    });

    this.destroyRef.onDestroy(() => {
      this.clearTypingTimer();
      this.socket.leaveConversation(conversationId);
      this.socket.disconnect();
    });
  }

  async send(content: string, mode: ComposeMode, generatedBy?: string): Promise<boolean> {
    const trimmed = content.trim();
    if (!trimmed) {
      return false;
    }

    this.stopTyping();
    this.sendError.set(null);

    try {
      const message = await firstValueFrom(
        this.api.sendMessage(this.conversationId, {
          sender: this.role,
          content: trimmed,
          mode,
          generatedBy,
        }),
      );
      this.applyMessage(message);
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
    return this.mutate(() =>
      this.socket.editMessage(this.conversationId, messageId, this.role, trimmed),
    );
  }

  async deleteMessage(messageId: string): Promise<boolean> {
    return this.mutate(() => this.socket.deleteMessage(this.conversationId, messageId, this.role));
  }

  private async mutate(send: () => Promise<MutateMessageAck>): Promise<boolean> {
    this.sendError.set(null);
    try {
      const ack = await send();
      if (!ack.ok || !ack.message) {
        this.sendError.set(ack.error ?? 'The server rejected that change.');
        return false;
      }
      this.applyUpdate(ack.message);
      return true;
    } catch (error) {
      this.sendError.set(error instanceof Error ? error.message : 'Could not reach the server.');
      return false;
    }
  }

  noteActivity(hasText: boolean): void {
    if (!hasText) {
      this.stopTyping();
      return;
    }
    if (!this.typingActive) {
      this.typingActive = true;
      this.socket.setTyping(this.conversationId, this.role, true);
    }
    this.clearTypingTimer();
    this.typingTimer = setTimeout(() => this.stopTyping(), TYPING_IDLE_MS);
  }

  stopTyping(): void {
    this.clearTypingTimer();
    if (this.typingActive) {
      this.typingActive = false;
      this.socket.setTyping(this.conversationId, this.role, false);
    }
  }

  setAnswererMode(mode: ComposeMode): void {
    this.socket.changeAnswererMode(this.conversationId, mode);
  }

  markCounterpartMessagesRead(): void {
    const unread = this.messages()
      .filter((message) => message.sender !== this.role && message.status !== 'read')
      .map((message) => message.id);
    this.socket.markRead(this.conversationId, this.role, unread);
  }

  private applyMessage(message: Message): void {
    this.messages.update((messages) =>
      messages.some((existing) => existing.id === message.id) ? messages : [...messages, message],
    );
  }

  private applyUpdate(message: Message): void {
    this.messages.update((messages) =>
      messages.map((existing) => (existing.id === message.id ? message : existing)),
    );
  }

  private subscribe(): void {
    this.socket
      .on(ServerEvents.ConversationState)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((state) => {
        this.messages.set(state.messages);
        this.typing.set(state.typing);
        this.online.set(state.online);
        this.answererMode.set(state.answererMode);
      });

    this.socket
      .on(ServerEvents.MessageNew)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ message }) => this.applyMessage(message));

    this.socket
      .on(ServerEvents.MessageUpdated)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ message }) => this.applyUpdate(message));

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
      .subscribe((event) => this.aiGenerating.set(event.generating));

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

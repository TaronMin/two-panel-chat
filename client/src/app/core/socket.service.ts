import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { io, type Socket } from 'socket.io-client';
import { API_BASE_URL } from './api.config';
import { ConnectionRegistryService } from './connection-registry.service';
import {
  ClientEvents,
  type ChatServerEvents,
  type ComposeMode,
  type ConnectionStatus,
  type JoinAck,
  type MutateMessageAck,
  type SenderRole,
} from './contracts';

const MUTATION_TIMEOUT_MS = 8000;

@Injectable()
export class SocketService {
  private readonly baseUrl = inject(API_BASE_URL);
  private socket: Socket | null = null;

  readonly status = signal<ConnectionStatus>('disconnected');

  constructor() {
    const unregister = inject(ConnectionRegistryService).register(this.status.asReadonly());
    inject(DestroyRef).onDestroy(unregister);
  }

  connect(): void {
    if (this.socket) {
      return;
    }

    this.status.set('connecting');
    this.socket = io(`${this.baseUrl}/chat`, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
    });

    this.socket.on('connect', () => this.status.set('connected'));
    this.socket.on('disconnect', () => this.status.set('disconnected'));
    this.socket.io.on('reconnect_attempt', () => this.status.set('reconnecting'));
    this.socket.io.on('error', () => this.status.set('reconnecting'));
  }

  disconnect(): void {
    this.socket?.close();
    this.socket = null;
    this.status.set('disconnected');
  }

  on<TEvent extends keyof ChatServerEvents & string>(
    event: TEvent,
  ): Observable<ChatServerEvents[TEvent]> {
    return new Observable<ChatServerEvents[TEvent]>((subscriber) => {
      const handler = (payload: ChatServerEvents[TEvent]) => subscriber.next(payload);
      this.socket?.on(event, handler as never);
      return () => {
        this.socket?.off(event, handler as never);
      };
    });
  }

  onConnected(handler: () => void): void {
    this.socket?.on('connect', handler);
    if (this.socket?.connected) {
      handler();
    }
  }

  joinConversation(conversationId: string, role: SenderRole): Promise<JoinAck> {
    if (!this.socket) {
      return Promise.reject(new Error('Socket is not connected'));
    }
    return this.socket.emitWithAck(ClientEvents.JoinConversation, {
      conversationId,
      role,
    }) as Promise<JoinAck>;
  }

  leaveConversation(conversationId: string): void {
    this.socket?.emit(ClientEvents.LeaveConversation, { conversationId });
  }

  setTyping(conversationId: string, role: SenderRole, isTyping: boolean): void {
    this.socket?.emit(isTyping ? ClientEvents.TypingStart : ClientEvents.TypingStop, {
      conversationId,
      role,
    });
  }

  changeAnswererMode(conversationId: string, mode: ComposeMode): void {
    this.socket?.emit(ClientEvents.ChangeAnswererMode, { conversationId, mode });
  }

  editMessage(
    conversationId: string,
    messageId: string,
    role: SenderRole,
    content: string,
  ): Promise<MutateMessageAck> {
    if (!this.socket) {
      return Promise.reject(new Error('Socket is not connected'));
    }
    return this.socket.timeout(MUTATION_TIMEOUT_MS).emitWithAck(ClientEvents.EditMessage, {
      conversationId,
      messageId,
      role,
      content,
    }) as Promise<MutateMessageAck>;
  }

  deleteMessage(
    conversationId: string,
    messageId: string,
    role: SenderRole,
  ): Promise<MutateMessageAck> {
    if (!this.socket) {
      return Promise.reject(new Error('Socket is not connected'));
    }
    return this.socket.timeout(MUTATION_TIMEOUT_MS).emitWithAck(ClientEvents.DeleteMessage, {
      conversationId,
      messageId,
      role,
    }) as Promise<MutateMessageAck>;
  }

  markRead(conversationId: string, role: SenderRole, messageIds: string[]): void {
    if (messageIds.length === 0) {
      return;
    }
    this.socket?.emit(ClientEvents.MarkRead, { conversationId, role, messageIds });
  }
}

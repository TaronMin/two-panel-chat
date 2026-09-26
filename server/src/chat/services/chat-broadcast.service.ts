import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';
import {
  ServerEvents,
  conversationGroup,
  type ChatServerEvents,
} from '../contracts/chat-events.js';
import type { ComposeMode, Message, MessageStatus, SenderRole } from '../contracts/models.js';

@Injectable()
export class ChatBroadcastService {
  private readonly logger = new Logger(ChatBroadcastService.name);
  private server: Server | null = null;

  attach(server: Server): void {
    this.server = server;
  }

  messageCreated(message: Message): void {
    this.emit(message.conversationId, ServerEvents.MessageNew, { message });
  }

  messageUpdated(message: Message): void {
    this.emit(message.conversationId, ServerEvents.MessageUpdated, { message });
  }

  typingChanged(conversationId: string, typing: SenderRole[]): void {
    this.emit(conversationId, ServerEvents.TypingUpdate, {
      conversationId,
      typing,
    });
  }

  answererModeChanged(conversationId: string, mode: ComposeMode, changedBy: SenderRole): void {
    this.emit(conversationId, ServerEvents.AnswererModeChanged, {
      conversationId,
      mode,
      changedBy,
    });
  }

  presenceChanged(conversationId: string, online: SenderRole[]): void {
    this.emit(conversationId, ServerEvents.PresenceUpdate, {
      conversationId,
      online,
    });
  }

  receipts(
    conversationId: string,
    messageIds: string[],
    status: MessageStatus,
    by: SenderRole,
  ): void {
    if (messageIds.length === 0) {
      return;
    }
    this.emit(conversationId, ServerEvents.MessageReceipt, {
      conversationId,
      messageIds,
      status,
      by,
    });
  }

  aiGenerating(conversationId: string, generating: boolean): void {
    this.emit(conversationId, ServerEvents.AiGenerating, {
      conversationId,
      generating,
    });
  }

  private emit<TEvent extends keyof ChatServerEvents & string>(
    conversationId: string,
    event: TEvent,
    payload: ChatServerEvents[TEvent],
  ): void {
    if (!this.server) {
      this.logger.warn(`Dropped "${event}" before the gateway initialised.`);
      return;
    }
    this.server.to(conversationGroup(conversationId)).emit(event, payload);
  }
}

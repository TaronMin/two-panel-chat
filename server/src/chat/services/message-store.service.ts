import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Conversation, Message, MessageStatus, SenderRole } from '../contracts/models.js';

export interface NewMessage {
  conversationId: string;
  sender: SenderRole;
  content: string;
  mode: Message['mode'];
  generatedBy?: string;
}

@Injectable()
export class MessageStore {
  private readonly conversations = new Map<string, Conversation>();
  private readonly messages = new Map<string, Message[]>();

  createConversation(title?: string): Conversation {
    const conversation: Conversation = {
      id: randomUUID(),
      title: title?.trim() || 'New conversation',
      createdAt: new Date().toISOString(),
      participants: ['user', 'answerer'],
    };
    this.conversations.set(conversation.id, conversation);
    this.messages.set(conversation.id, []);
    return conversation;
  }

  listConversations(): Conversation[] {
    return [...this.conversations.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  requireConversation(id: string): Conversation {
    const conversation = this.conversations.get(id);
    if (!conversation) {
      throw new NotFoundException(`Conversation ${id} not found`);
    }
    return conversation;
  }

  appendMessage(input: NewMessage): Message {
    this.requireConversation(input.conversationId);
    const message: Message = {
      id: randomUUID(),
      conversationId: input.conversationId,
      sender: input.sender,
      content: input.content,
      mode: input.mode,
      createdAt: new Date().toISOString(),
      status: 'sent',
      ...(input.generatedBy ? { generatedBy: input.generatedBy } : {}),
    };
    this.messages.get(input.conversationId)!.push(message);
    return message;
  }

  listMessages(conversationId: string, limit?: number): Message[] {
    this.requireConversation(conversationId);
    const all = this.messages.get(conversationId) ?? [];
    return limit && limit > 0 ? all.slice(-limit) : [...all];
  }

  requireMessage(conversationId: string, messageId: string): Message {
    const message = (this.messages.get(conversationId) ?? []).find(
      (candidate) => candidate.id === messageId,
    );
    if (!message) {
      throw new NotFoundException(`Message ${messageId} not found`);
    }
    return message;
  }

  editMessage(conversationId: string, messageId: string, content: string): Message {
    const message = this.requireMessage(conversationId, messageId);
    message.content = content;
    message.editedAt = new Date().toISOString();
    return message;
  }

  deleteMessage(conversationId: string, messageId: string): Message {
    const message = this.requireMessage(conversationId, messageId);
    message.content = '';
    message.deletedAt = new Date().toISOString();
    delete message.editedAt;
    return message;
  }

  markStatus(conversationId: string, messageIds: string[], status: MessageStatus): Message[] {
    const ids = new Set(messageIds);
    const updated: Message[] = [];
    for (const message of this.messages.get(conversationId) ?? []) {
      if (ids.has(message.id) && message.status !== status) {
        message.status = status;
        updated.push(message);
      }
    }
    return updated;
  }
}

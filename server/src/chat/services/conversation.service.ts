import { ForbiddenException, Injectable } from '@nestjs/common';
import type { AiSuggestion } from '../../ai/ai-provider.interface.js';
import { AiService } from '../../ai/ai.service.js';
import type { SendMessageDto } from '../dto/chat.dto.js';
import type {
  ComposeMode,
  Conversation,
  ConversationState,
  Message,
  SenderRole,
} from '../contracts/models.js';
import { ChatBroadcastService } from './chat-broadcast.service.js';
import { MessageStore } from './message-store.service.js';
import { PresenceService } from './presence.service.js';

@Injectable()
export class ConversationService {
  constructor(
    private readonly store: MessageStore,
    private readonly presence: PresenceService,
    private readonly broadcast: ChatBroadcastService,
    private readonly ai: AiService,
  ) {}

  createConversation(title?: string): Conversation {
    return this.store.createConversation(title);
  }

  listConversations(): Conversation[] {
    return this.store.listConversations();
  }

  getConversation(id: string): Conversation {
    return this.store.requireConversation(id);
  }

  getHistory(conversationId: string, limit?: number): Message[] {
    return this.store.listMessages(conversationId, limit);
  }

  getState(conversationId: string): ConversationState {
    return {
      conversation: this.store.requireConversation(conversationId),
      messages: this.store.listMessages(conversationId),
      answererMode: this.presence.getAnswererMode(conversationId),
      typing: this.presence.typing(conversationId),
      online: this.presence.online(conversationId),
      aiGenerating: this.presence.isAiGenerating(conversationId),
    };
  }

  sendMessage(dto: SendMessageDto): Message {
    this.store.requireConversation(dto.conversationId);

    const message = this.store.appendMessage({
      conversationId: dto.conversationId,
      sender: dto.sender,
      content: dto.content.trim(),
      mode: dto.mode,
      generatedBy: dto.generatedBy,
    });

    const typing = this.presence.setTyping(dto.conversationId, dto.sender, false);
    this.broadcast.messageCreated(message);
    this.broadcast.typingChanged(dto.conversationId, typing);

    const others = this.presence.online(dto.conversationId).filter((role) => role !== dto.sender);
    if (others.length > 0) {
      const [updated] = this.store.markStatus(dto.conversationId, [message.id], 'delivered');
      if (updated) {
        this.broadcast.receipts(dto.conversationId, [message.id], 'delivered', others[0]!);
      }
    }

    return message;
  }

  editMessage(
    conversationId: string,
    messageId: string,
    role: SenderRole,
    content: string,
  ): Message {
    this.assertOwnMessage(conversationId, messageId, role, 'edit');
    const updated = this.store.editMessage(conversationId, messageId, content.trim());
    this.broadcast.messageUpdated(updated);
    return updated;
  }

  deleteMessage(conversationId: string, messageId: string, role: SenderRole): Message {
    this.assertOwnMessage(conversationId, messageId, role, 'delete');
    const deleted = this.store.deleteMessage(conversationId, messageId);
    this.broadcast.messageUpdated(deleted);
    return deleted;
  }

  private assertOwnMessage(
    conversationId: string,
    messageId: string,
    role: SenderRole,
    action: 'edit' | 'delete',
  ): void {
    this.store.requireConversation(conversationId);
    const message = this.store.requireMessage(conversationId, messageId);

    if (message.sender !== role) {
      throw new ForbiddenException(`The ${role} cannot ${action} a message sent by someone else.`);
    }
    if (message.deletedAt) {
      throw new ForbiddenException('This message was already deleted.');
    }
  }

  markRead(conversationId: string, role: SenderRole, messageIds: string[]): void {
    const updated = this.store.markStatus(conversationId, messageIds, 'read');
    this.broadcast.receipts(
      conversationId,
      updated.map((message) => message.id),
      'read',
      role,
    );
  }

  setTyping(conversationId: string, role: SenderRole, isTyping: boolean): void {
    const typing = this.presence.setTyping(conversationId, role, isTyping);
    this.broadcast.typingChanged(conversationId, typing);
  }

  setAnswererMode(conversationId: string, mode: ComposeMode): ComposeMode {
    const applied = this.presence.setAnswererMode(conversationId, mode);
    this.broadcast.answererModeChanged(conversationId, applied, 'answerer');
    return applied;
  }

  async generateSuggestion(
    conversationId: string,
    instruction?: string,
    autoSend = false,
  ): Promise<{ suggestion: AiSuggestion; sent?: Message }> {
    this.store.requireConversation(conversationId);
    const history = this.store.listMessages(conversationId).filter((message) => !message.deletedAt);

    this.presence.setAiGenerating(conversationId, true);
    this.broadcast.aiGenerating(conversationId, true);
    this.setTyping(conversationId, 'answerer', true);
    try {
      const suggestion = await this.ai.suggestReply(conversationId, history, instruction);

      if (!autoSend) {
        return { suggestion };
      }

      const sent = this.sendMessage({
        conversationId,
        sender: 'answerer',
        content: suggestion.content,
        mode: 'ai',
        generatedBy: suggestion.provider,
      });
      return { suggestion, sent };
    } finally {
      this.presence.setAiGenerating(conversationId, false);
      this.setTyping(conversationId, 'answerer', false);
      this.broadcast.aiGenerating(conversationId, false);
    }
  }

  providerInfo() {
    return this.ai.describeProvider();
  }

  registerConnection(conversationId: string, connectionId: string, role: SenderRole): void {
    this.presence.join(conversationId, connectionId, role);
    this.broadcast.presenceChanged(conversationId, this.presence.online(conversationId));
  }

  unregisterConnection(conversationId: string, connectionId: string): void {
    this.presence.leave(conversationId, connectionId);
    this.broadcast.presenceChanged(conversationId, this.presence.online(conversationId));
    this.broadcast.typingChanged(conversationId, this.presence.typing(conversationId));
  }

  unregisterEverywhere(connectionId: string): void {
    for (const conversationId of this.presence.leaveAll(connectionId)) {
      this.broadcast.presenceChanged(conversationId, this.presence.online(conversationId));
      this.broadcast.typingChanged(conversationId, this.presence.typing(conversationId));
    }
  }
}

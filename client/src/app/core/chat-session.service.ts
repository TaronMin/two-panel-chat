import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ChatApiService } from './chat-api.service';
import { ChatHistoryService } from './chat-history.service';
import type { Conversation } from './contracts';

const CONVERSATION_KEY = 'chat.conversationId';

@Injectable({ providedIn: 'root' })
export class ChatSessionService {
  private readonly chatApi = inject(ChatApiService);
  private readonly history = inject(ChatHistoryService);

  readonly conversation = signal<Conversation | null>(null);
  readonly sessionError = signal<string | null>(null);

  private pendingConversation: Promise<Conversation> | null = null;

  ensureConversation(): Promise<Conversation> {
    this.pendingConversation ??= this.resolveConversation();
    return this.pendingConversation;
  }

  async startNewConversation(): Promise<Conversation> {
    const conversation = await firstValueFrom(this.chatApi.createConversation('Chat'));
    this.adopt(conversation);
    return conversation;
  }

  async openConversation(conversationId: string): Promise<Conversation> {
    const state = await firstValueFrom(this.chatApi.getState(conversationId));
    this.adopt(state.conversation);
    return state.conversation;
  }

  private adopt(conversation: Conversation): void {
    sessionStorage.setItem(CONVERSATION_KEY, conversation.id);
    this.conversation.set(conversation);
    this.pendingConversation = Promise.resolve(conversation);
  }

  private async resolveConversation(): Promise<Conversation> {
    try {
      const existingId = sessionStorage.getItem(CONVERSATION_KEY);
      if (existingId) {
        try {
          const state = await firstValueFrom(this.chatApi.getState(existingId));
          this.adopt(state.conversation);
          return state.conversation;
        } catch {
          sessionStorage.removeItem(CONVERSATION_KEY);
          this.history.forget(existingId);
        }
      }
      return await this.startNewConversation();
    } catch (error) {
      this.sessionError.set(
        error instanceof Error ? error.message : 'Something went wrong, please try later.',
      );
      throw error;
    }
  }
}

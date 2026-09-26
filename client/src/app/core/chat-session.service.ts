import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ChatApiService } from './chat-api.service';
import type { Conversation } from './contracts';

const CONVERSATION_KEY = 'chat.conversationId';

@Injectable({ providedIn: 'root' })
export class ChatSessionService {
  private readonly api = inject(ChatApiService);

  readonly conversation = signal<Conversation | null>(null);
  readonly error = signal<string | null>(null);

  private bootstrapping: Promise<Conversation> | null = null;

  bootstrap(): Promise<Conversation> {
    this.bootstrapping ??= this.resolveConversation();
    return this.bootstrapping;
  }

  async startNewConversation(): Promise<Conversation> {
    const conversation = await firstValueFrom(this.api.createConversation('Two-panel chat'));
    sessionStorage.setItem(CONVERSATION_KEY, conversation.id);
    this.conversation.set(conversation);
    this.bootstrapping = Promise.resolve(conversation);
    return conversation;
  }

  private async resolveConversation(): Promise<Conversation> {
    try {
      const existingId = sessionStorage.getItem(CONVERSATION_KEY);
      if (existingId) {
        try {
          const state = await firstValueFrom(this.api.getState(existingId));
          this.conversation.set(state.conversation);
          return state.conversation;
        } catch {
          sessionStorage.removeItem(CONVERSATION_KEY);
        }
      }
      return await this.startNewConversation();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Could not reach the chat backend.');
      throw error;
    }
  }
}

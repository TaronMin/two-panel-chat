import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { API_BASE_URL } from './api.config';
import type {
  AiSuggestion,
  Conversation,
  ConversationState,
  Message,
  SendMessagePayload,
} from './contracts';

@Injectable({ providedIn: 'root' })
export class ChatApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(API_BASE_URL)}/api`;

  createConversation(title?: string): Observable<Conversation> {
    return this.http.post<Conversation>(`${this.base}/conversations`, { title });
  }

  getState(conversationId: string): Observable<ConversationState> {
    return this.http.get<ConversationState>(`${this.base}/conversations/${conversationId}/state`);
  }

  sendMessage(conversationId: string, payload: SendMessagePayload): Observable<Message> {
    return this.http.post<Message>(
      `${this.base}/conversations/${conversationId}/messages`,
      payload,
    );
  }

  generateSuggestion(
    conversationId: string,
    options: { instruction?: string; autoSend?: boolean } = {},
  ): Observable<{ suggestion: AiSuggestion; sent?: Message }> {
    return this.http.post<{ suggestion: AiSuggestion; sent?: Message }>(
      `${this.base}/conversations/${conversationId}/suggestions`,
      options,
    );
  }
}

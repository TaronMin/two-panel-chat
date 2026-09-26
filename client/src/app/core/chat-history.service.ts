import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ChatApiService } from './chat-api.service';
import type { Conversation, ConversationState, Message } from './contracts';

const HISTORY_KEY = 'chat.history';
const MAX_ENTRIES = 25;
const LABEL_MAX_LENGTH = 48;
const PREVIEW_MAX_LENGTH = 64;

export interface ConversationSummary {
  id: string;
  label: string;
  preview: string;
  updatedAt: string;
  messageCount: number;
}

function truncate(value: string, max: number): string {
  const collapsed = value.replace(/\s+/g, ' ').trim();
  return collapsed.length > max ? `${collapsed.slice(0, max - 1)}…` : collapsed;
}

function readStoredSummaries(): ConversationSummary[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (entry): entry is ConversationSummary =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as ConversationSummary).id === 'string',
    );
  } catch {
    return [];
  }
}

function writeStoredSummaries(summaries: ConversationSummary[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(summaries));
  } catch {
    return;
  }
}

@Injectable({ providedIn: 'root' })
export class ChatHistoryService {
  private readonly chatApi = inject(ChatApiService);

  private readonly entries = signal<ConversationSummary[]>(readStoredSummaries());

  readonly summaries = this.entries.asReadonly();
  readonly isRefreshing = signal(false);
  readonly hasLoaded = signal(false);
  readonly count = computed(() => this.entries().length);

  remember(conversation: Conversation): void {
    this.update((current) => [
      {
        id: conversation.id,
        label: truncate(conversation.title, LABEL_MAX_LENGTH) || 'New conversation',
        preview: 'No messages yet',
        updatedAt: conversation.createdAt,
        messageCount: 0,
      },
      ...current.filter((entry) => entry.id !== conversation.id),
    ]);
  }

  forget(conversationId: string): void {
    this.update((current) => current.filter((entry) => entry.id !== conversationId));
  }

  async refresh(): Promise<void> {
    const ids = this.entries().map((entry) => entry.id);
    if (ids.length === 0) {
      this.hasLoaded.set(true);
      return;
    }

    this.isRefreshing.set(true);
    try {
      const resolved = await Promise.all(ids.map((id) => this.summarise(id)));
      this.update(() => resolved.filter((entry): entry is ConversationSummary => entry !== null));
    } finally {
      this.isRefreshing.set(false);
      this.hasLoaded.set(true);
    }
  }

  private async summarise(conversationId: string): Promise<ConversationSummary | null> {
    try {
      const state = await firstValueFrom(this.chatApi.getState(conversationId));
      return this.toSummary(state);
    } catch (error) {
      const gone = error instanceof HttpErrorResponse && error.status === 404;
      if (gone) {
        return null;
      }
      return this.entries().find((entry) => entry.id === conversationId) ?? null;
    }
  }

  private toSummary(state: ConversationState): ConversationSummary {
    const visible = state.messages.filter((message) => !message.deletedAt);
    const firstFromUser = visible.find((message) => message.sender === 'user');
    const last = visible[visible.length - 1];

    return {
      id: state.conversation.id,
      label: this.labelFor(state.conversation, firstFromUser),
      preview: last ? truncate(last.content, PREVIEW_MAX_LENGTH) : 'No messages yet',
      updatedAt: last?.createdAt ?? state.conversation.createdAt,
      messageCount: visible.length,
    };
  }

  private labelFor(conversation: Conversation, firstFromUser: Message | undefined): string {
    if (firstFromUser) {
      return truncate(firstFromUser.content, LABEL_MAX_LENGTH);
    }
    return truncate(conversation.title, LABEL_MAX_LENGTH) || 'New conversation';
  }

  private update(change: (current: ConversationSummary[]) => ConversationSummary[]): void {
    this.entries.update((current) => {
      const next = change(current)
        .slice()
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, MAX_ENTRIES);
      writeStoredSummaries(next);
      return next;
    });
  }
}

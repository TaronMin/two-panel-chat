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

  track(conversationId: string, messages: readonly Message[], fallbackTitle: string): void {
    const visible = messages.filter((message) => !message.deletedAt);
    if (visible.length === 0) {
      return;
    }

    const summary = this.summaryFrom(conversationId, visible, fallbackTitle);
    const existing = this.entries().find((entry) => entry.id === conversationId);
    if (existing && this.sameSummary(existing, summary)) {
      return;
    }

    this.update((current) => [summary, ...current.filter((entry) => entry.id !== conversationId)]);
  }

  forget(conversationId: string): void {
    this.update((current) => current.filter((entry) => entry.id !== conversationId));
  }

  clear(): void {
    this.update(() => []);
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
      this.update(() =>
        resolved.filter(
          (entry): entry is ConversationSummary => entry !== null && entry.messageCount > 0,
        ),
      );
    } finally {
      this.isRefreshing.set(false);
      this.hasLoaded.set(true);
    }
  }

  private sameSummary(left: ConversationSummary, right: ConversationSummary): boolean {
    return (
      left.label === right.label &&
      left.preview === right.preview &&
      left.updatedAt === right.updatedAt &&
      left.messageCount === right.messageCount
    );
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
    const summary = this.summaryFrom(state.conversation.id, visible, state.conversation.title);
    return { ...summary, updatedAt: summary.updatedAt || state.conversation.createdAt };
  }

  private summaryFrom(
    conversationId: string,
    visible: readonly Message[],
    fallbackTitle: string,
  ): ConversationSummary {
    const firstFromUser = visible.find((message) => message.sender === 'user');
    const last = visible[visible.length - 1];

    return {
      id: conversationId,
      label: firstFromUser
        ? truncate(firstFromUser.content, LABEL_MAX_LENGTH)
        : truncate(fallbackTitle, LABEL_MAX_LENGTH) || 'New conversation',
      preview: last ? truncate(last.content, PREVIEW_MAX_LENGTH) : 'No messages yet',
      updatedAt: last?.createdAt ?? '',
      messageCount: visible.length,
    };
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

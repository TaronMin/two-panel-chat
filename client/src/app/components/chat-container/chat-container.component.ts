import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ChatHistoryService } from '../../core/chat-history.service';
import { ChatSessionService } from '../../core/chat-session.service';
import { ConnectionRegistryService } from '../../core/connection-registry.service';
import type { SenderRole } from '../../core/contracts';
import { AnswererPanelComponent } from '../answerer-panel/answerer-panel.component';
import { ConversationListComponent } from '../conversation-list/conversation-list.component';
import { UserPanelComponent } from '../user-panel/user-panel.component';

@Component({
  selector: 'app-chat-container',
  imports: [UserPanelComponent, AnswererPanelComponent, ConversationListComponent],
  templateUrl: './chat-container.component.html',
  host: { class: 'block', '(document:keydown.escape)': 'closeHistory()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatContainerComponent {
  protected readonly session = inject(ChatSessionService);
  protected readonly history = inject(ChatHistoryService);
  private readonly connectionRegistry = inject(ConnectionRegistryService);

  protected readonly conversationId = signal<string | null>(null);

  protected readonly activePanel = signal<SenderRole>('user');
  protected readonly historyOpen = signal(false);
  protected readonly isOpeningConversation = signal(true);
  protected readonly loadingPanels: SenderRole[] = ['user', 'answerer'];

  protected readonly mountedConversation = computed(() => {
    const id = this.conversationId();
    return id ? [id] : [];
  });

  protected readonly statusLabel = computed(() => {
    switch (this.connectionRegistry.overallStatus()) {
      case 'connected':
        return 'Connected';
      case 'reconnecting':
        return 'Reconnecting…';
      case 'connecting':
        return 'Connecting…';
      default:
        return 'Disconnected';
    }
  });

  protected readonly statusDotClass = computed(() => {
    switch (this.connectionRegistry.overallStatus()) {
      case 'connected':
        return 'bg-emerald-500';
      case 'reconnecting':
      case 'connecting':
        return 'bg-amber-500 animate-pulse';
      default:
        return 'bg-rose-500';
    }
  });

  protected readonly statusTextClass = computed(() =>
    this.connectionRegistry.overallStatus() === 'connected' ? 'text-emerald-700' : 'text-slate-600',
  );

  constructor() {
    void this.session
      .ensureConversation()
      .then((conversation) => {
        this.conversationId.set(conversation.id);
        this.isOpeningConversation.set(false);
        return this.history.refresh();
      })
      .catch(() => {
        this.conversationId.set(null);
        this.isOpeningConversation.set(false);
      });
  }

  protected panelVisibilityClass(panel: SenderRole): string {
    const display = this.activePanel() === panel ? 'flex' : 'hidden lg:flex';
    return `min-h-0 min-w-0 flex-col ${display}`;
  }

  protected tabClass(panel: SenderRole): string {
    return this.activePanel() === panel
      ? 'bg-white text-slate-800 shadow-sm'
      : 'text-slate-500 hover:text-slate-700';
  }

  protected toggleHistory(): void {
    this.historyOpen.update((open) => !open);
    if (this.historyOpen()) {
      void this.history.refresh();
    }
  }

  protected closeHistory(): void {
    this.historyOpen.set(false);
  }

  protected async startNewConversation(): Promise<void> {
    this.closeHistory();
    this.conversationId.set(null);
    this.isOpeningConversation.set(true);
    try {
      const conversation = await this.session.startNewConversation();
      this.conversationId.set(conversation.id);
    } finally {
      this.isOpeningConversation.set(false);
    }
    void this.history.refresh();
  }

  protected async selectConversation(id: string): Promise<void> {
    this.closeHistory();
    if (id === this.conversationId()) {
      return;
    }
    this.conversationId.set(null);
    this.isOpeningConversation.set(true);
    try {
      const conversation = await this.session.openConversation(id);
      this.conversationId.set(conversation.id);
    } catch {
      this.history.forget(id);
      this.isOpeningConversation.set(false);
      await this.startNewConversation();
      return;
    } finally {
      this.isOpeningConversation.set(false);
    }
    void this.history.refresh();
  }

  protected removeConversation(id: string): void {
    this.history.forget(id);
    if (id === this.conversationId()) {
      void this.startNewConversation();
    }
  }
}

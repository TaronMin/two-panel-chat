import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ChatSessionService } from '../../core/chat-session.service';
import { ConnectionRegistryService } from '../../core/connection-registry.service';
import type { SenderRole } from '../../core/contracts';
import { AnswererPanelComponent } from '../answerer-panel/answerer-panel.component';
import { UserPanelComponent } from '../user-panel/user-panel.component';

@Component({
  selector: 'app-chat-container',
  imports: [UserPanelComponent, AnswererPanelComponent],
  templateUrl: './chat-container.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatContainerComponent {
  protected readonly session = inject(ChatSessionService);
  private readonly connections = inject(ConnectionRegistryService);

  protected readonly conversationId = signal<string | null>(null);

  protected readonly activePanel = signal<SenderRole>('user');

  protected readonly statusLabel = computed(() => {
    switch (this.connections.overall()) {
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
    switch (this.connections.overall()) {
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
    this.connections.overall() === 'connected' ? 'text-emerald-700' : 'text-slate-600',
  );

  constructor() {
    void this.session
      .bootstrap()
      .then((conversation) => this.conversationId.set(conversation.id))
      .catch(() => this.conversationId.set(null));
  }

  protected panelVisibility(panel: SenderRole): string {
    const display = this.activePanel() === panel ? 'flex' : 'hidden lg:flex';
    return `min-h-0 min-w-0 flex-col ${display}`;
  }

  protected tabClass(panel: SenderRole): string {
    return this.activePanel() === panel
      ? 'bg-white text-slate-800 shadow-sm'
      : 'text-slate-500 hover:text-slate-700';
  }

  protected async newConversation(): Promise<void> {
    this.conversationId.set(null);
    const conversation = await this.session.startNewConversation();
    this.conversationId.set(conversation.id);
  }
}

import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import type { ConversationSummary } from '../../core/chat-history.service';

@Component({
  selector: 'app-conversation-list',
  imports: [DatePipe],
  templateUrl: './conversation-list.component.html',
  host: { class: 'flex min-h-0 flex-col' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConversationListComponent {
  readonly summaries = input.required<readonly ConversationSummary[]>();
  readonly activeId = input<string | null>(null);
  readonly refreshing = input(false);
  readonly loaded = input(true);

  protected readonly skeletonRows = [0, 1, 2];

  protected readonly showSkeleton = computed(() => !this.loaded() && this.summaries().length === 0);

  readonly select = output<string>();
  readonly remove = output<string>();
  readonly create = output<void>();
  readonly clear = output<void>();

  protected onSelect(id: string): void {
    if (id !== this.activeId()) {
      this.select.emit(id);
    }
  }

  protected onRemove(event: Event, id: string): void {
    event.stopPropagation();
    this.remove.emit(id);
  }
}

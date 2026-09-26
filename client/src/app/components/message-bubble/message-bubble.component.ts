import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MESSAGE_MAX_LENGTH, type Message, type SenderRole } from '../../core/contracts';
import { MarkdownContentComponent } from '../markdown-content/markdown-content.component';

export interface MessageEdit {
  id: string;
  content: string;
}

@Component({
  selector: 'app-message-bubble',
  imports: [DatePipe, ReactiveFormsModule, MarkdownContentComponent],
  templateUrl: './message-bubble.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MessageBubbleComponent {
  readonly message = input.required<Message>();
  readonly viewerRole = input.required<SenderRole>();
  readonly canModify = input(true);

  readonly editMessage = output<MessageEdit>();
  readonly deleteMessage = output<string>();

  private readonly fb = inject(FormBuilder);

  protected readonly maxLength = MESSAGE_MAX_LENGTH;

  protected readonly editControl = this.fb.nonNullable.control('', [
    Validators.maxLength(MESSAGE_MAX_LENGTH),
  ]);
  protected readonly editing = signal(false);
  protected readonly confirmingDelete = signal(false);

  readonly isOwn = computed(() => this.message().sender === this.viewerRole());

  protected readonly deleted = computed(() => Boolean(this.message().deletedAt));

  protected readonly showAiBadge = computed(
    () => this.message().mode === 'ai' && this.isOwn() && !this.deleted(),
  );

  protected readonly actionsAvailable = computed(
    () => this.isOwn() && !this.deleted() && this.canModify(),
  );

  readonly senderLabel = computed(() => (this.message().sender === 'user' ? 'User' : 'Answerer'));

  readonly bubbleClass = computed(() => {
    if (this.deleted()) {
      return 'rounded-bl-sm bg-slate-100 text-slate-400 italic ring-1 ring-slate-200';
    }
    if (!this.isOwn()) {
      return 'rounded-bl-sm bg-white text-slate-700 ring-1 ring-slate-200';
    }
    return this.viewerRole() === 'user'
      ? 'rounded-br-sm bg-indigo-600 text-white'
      : 'rounded-br-sm bg-emerald-600 text-white';
  });

  readonly statusLabel = computed(() => {
    switch (this.message().status) {
      case 'read':
        return 'Read ✓✓';
      case 'delivered':
        return 'Delivered ✓✓';
      default:
        return 'Sent ✓';
    }
  });

  protected startEdit(): void {
    this.confirmingDelete.set(false);
    this.editControl.setValue(this.message().content);
    this.editing.set(true);
  }

  protected cancelEdit(): void {
    this.editing.set(false);
    this.editControl.setValue('');
  }

  protected saveEdit(): void {
    const content = this.editControl.value.trim();
    if (!content || content === this.message().content) {
      this.cancelEdit();
      return;
    }
    this.editMessage.emit({ id: this.message().id, content });
    this.editing.set(false);
  }

  protected onEditKeydown(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.shiftKey) {
      return;
    }
    keyboardEvent.preventDefault();
    this.saveEdit();
  }

  protected askDelete(): void {
    this.confirmingDelete.set(true);
  }

  protected cancelDelete(): void {
    this.confirmingDelete.set(false);
  }

  protected confirmDelete(): void {
    this.confirmingDelete.set(false);
    this.deleteMessage.emit(this.message().id);
  }
}

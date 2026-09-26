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

  private readonly formBuilder = inject(FormBuilder);

  protected readonly messageMaxLength = MESSAGE_MAX_LENGTH;

  protected readonly editControl = this.formBuilder.nonNullable.control('', [
    Validators.maxLength(MESSAGE_MAX_LENGTH),
  ]);
  protected readonly isEditing = signal(false);
  protected readonly isConfirmingDelete = signal(false);

  readonly isOwn = computed(() => this.message().sender === this.viewerRole());

  protected readonly isDeleted = computed(() => Boolean(this.message().deletedAt));

  protected readonly showAiBadge = computed(
    () => this.message().mode === 'ai' && this.isOwn() && !this.isDeleted(),
  );

  protected readonly canShowActions = computed(
    () => this.isOwn() && !this.isDeleted() && this.canModify(),
  );

  readonly senderLabel = computed(() => (this.message().sender === 'user' ? 'User' : 'Answerer'));

  readonly bubbleClass = computed(() => {
    if (this.isDeleted()) {
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
    this.isConfirmingDelete.set(false);
    this.editControl.setValue(this.message().content);
    this.isEditing.set(true);
  }

  protected cancelEdit(): void {
    this.isEditing.set(false);
    this.editControl.setValue('');
  }

  protected saveEdit(): void {
    const content = this.editControl.value.trim();
    if (!content || content === this.message().content) {
      this.cancelEdit();
      return;
    }
    this.editMessage.emit({ id: this.message().id, content });
    this.isEditing.set(false);
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
    this.isConfirmingDelete.set(true);
  }

  protected cancelDelete(): void {
    this.isConfirmingDelete.set(false);
  }

  protected confirmDelete(): void {
    this.isConfirmingDelete.set(false);
    this.deleteMessage.emit(this.message().id);
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { COUNTER_VISIBLE_RATIO, MESSAGE_MAX_LENGTH } from '../../core/contracts';
import { PanelChatService } from '../../core/panel-chat.service';
import { SocketService } from '../../core/socket.service';
import type { MessageEdit } from '../message-bubble/message-bubble.component';
import { MessageThreadComponent } from '../message-thread/message-thread.component';

@Component({
  selector: 'app-user-panel',
  imports: [ReactiveFormsModule, MessageThreadComponent],
  providers: [SocketService, PanelChatService],
  templateUrl: './user-panel.component.html',
  host: { class: 'flex min-h-0 flex-col' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserPanelComponent {
  readonly conversationId = input.required<string>();

  protected readonly chat = inject(PanelChatService);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly messageMaxLength = MESSAGE_MAX_LENGTH;

  protected readonly composerForm = this.formBuilder.nonNullable.group({
    content: ['', [Validators.required, Validators.maxLength(MESSAGE_MAX_LENGTH)]],
  });

  protected readonly isSending = signal(false);

  private readonly contentValue = toSignal(this.composerForm.controls.content.valueChanges, {
    initialValue: '',
  });

  protected readonly contentLength = computed(() => this.contentValue().length);
  protected readonly showContentCounter = computed(
    () => this.contentLength() >= MESSAGE_MAX_LENGTH * COUNTER_VISIBLE_RATIO,
  );

  protected readonly typingLabel = computed(() =>
    this.chat.typing().includes('answerer') ? 'Answerer is typing…' : null,
  );

  protected readonly presenceLabel = computed(() =>
    this.chat.online().includes('answerer') ? 'Answerer is online' : 'Waiting for the answerer…',
  );

  constructor() {
    effect(() => {
      const id = this.conversationId();
      if (id) {
        void this.chat.joinConversation(id, 'user');
      }
    });

    effect(() => {
      this.chat.messages();
      this.chat.markCounterpartMessagesRead();
    });
  }

  protected onEditMessage({ id, content }: MessageEdit): void {
    void this.chat.editMessage(id, content);
  }

  protected onDeleteMessage(id: string): void {
    void this.chat.deleteMessage(id);
  }

  protected onComposerInput(): void {
    this.chat.reportComposerActivity(Boolean(this.composerForm.controls.content.value.trim()));
  }

  protected onComposerEnter(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.shiftKey) {
      return;
    }
    keyboardEvent.preventDefault();
    void this.sendMessage();
  }

  protected async sendMessage(): Promise<void> {
    if (this.composerForm.invalid || this.isSending()) {
      return;
    }
    this.isSending.set(true);
    try {
      const sent = await this.chat.sendMessage(this.composerForm.controls.content.value, 'manual');
      if (sent) {
        this.composerForm.reset({ content: '' });
      }
    } finally {
      this.isSending.set(false);
    }
  }
}

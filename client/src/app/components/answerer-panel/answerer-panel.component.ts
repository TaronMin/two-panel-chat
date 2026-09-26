import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators, type AbstractControl } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { ChatApiService } from '../../core/chat-api.service';
import {
  COUNTER_VISIBLE_RATIO,
  INSTRUCTION_MAX_LENGTH,
  MESSAGE_MAX_LENGTH,
  type AiSuggestion,
  type ComposeMode,
} from '../../core/contracts';
import { PanelChatService } from '../../core/panel-chat.service';
import { SocketService } from '../../core/socket.service';
import { MarkdownContentComponent } from '../markdown-content/markdown-content.component';
import type { MessageEdit } from '../message-bubble/message-bubble.component';
import { MessageThreadComponent } from '../message-thread/message-thread.component';
import { ModeToggleComponent } from '../mode-toggle/mode-toggle.component';

const MODE_KEY = 'chat.answererMode';
const AUTO_SEND_KEY = 'chat.autoSend';
const AUTO_ANSWER_KEY = 'chat.autoAnswer';

@Component({
  selector: 'app-answerer-panel',
  imports: [
    ReactiveFormsModule,
    MessageThreadComponent,
    ModeToggleComponent,
    MarkdownContentComponent,
  ],
  providers: [SocketService, PanelChatService],
  templateUrl: './answerer-panel.component.html',
  host: { class: 'flex min-h-0 flex-col' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnswererPanelComponent {
  readonly conversationId = input.required<string>();

  protected readonly chat = inject(PanelChatService);
  private readonly api = inject(ChatApiService);
  private readonly fb = inject(FormBuilder);

  protected readonly maxLength = MESSAGE_MAX_LENGTH;
  protected readonly instructionMaxLength = INSTRUCTION_MAX_LENGTH;

  protected readonly form = this.fb.nonNullable.group({
    content: ['', [Validators.required, Validators.maxLength(MESSAGE_MAX_LENGTH)]],
  });
  protected readonly instruction = this.fb.nonNullable.control('', [
    Validators.maxLength(INSTRUCTION_MAX_LENGTH),
  ]);
  protected readonly draftControl = this.fb.nonNullable.control('', [
    Validators.required,
    Validators.maxLength(MESSAGE_MAX_LENGTH),
  ]);

  private readonly contentValue = toSignal(this.form.controls.content.valueChanges, {
    initialValue: '',
  });
  private readonly instructionValue = toSignal(this.instruction.valueChanges, {
    initialValue: '',
  });

  protected readonly contentLength = computed(() => this.contentValue().length);
  protected readonly showContentCounter = computed(
    () => this.contentLength() >= MESSAGE_MAX_LENGTH * COUNTER_VISIBLE_RATIO,
  );

  protected readonly instructionLength = computed(() => this.instructionValue().length);
  protected readonly showInstructionCounter = computed(
    () => this.instructionLength() >= INSTRUCTION_MAX_LENGTH * COUNTER_VISIBLE_RATIO,
  );

  protected readonly draft = signal<AiSuggestion | null>(null);
  protected readonly showPreview = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly autoSend = signal(false);
  protected readonly autoAnswer = signal(false);
  private readonly requestPending = signal(false);

  private autoAnsweredMessageId: string | null = null;

  protected readonly mode = this.chat.answererMode;

  protected readonly autoSendEffective = computed(() => this.autoAnswer() || this.autoSend());

  protected readonly generating = computed(() => this.requestPending() || this.chat.aiGenerating());

  protected readonly typingLabel = computed(() =>
    this.chat.typing().includes('user') ? 'User is typing…' : null,
  );

  protected readonly presenceLabel = computed(() =>
    this.chat.online().includes('user') ? 'User is online' : 'Waiting for the user…',
  );

  constructor() {
    effect(() => {
      const id = this.conversationId();
      if (id) {
        this.autoAnsweredMessageId = null;
        void this.chat.init(id, 'answerer').then(() => this.restorePersistedMode());
      }
    });

    effect(() => sessionStorage.setItem(MODE_KEY, this.chat.answererMode()));

    effect(() => {
      this.chat.messages();
      this.chat.markCounterpartMessagesRead();
    });

    effect(() => {
      const generating = this.generating();
      this.setDisabled(this.form.controls.content, generating);
      this.setDisabled(this.instruction, generating);
      this.setDisabled(this.draftControl, generating);
    });

    effect(() => this.maybeAutoAnswer());
  }

  private maybeAutoAnswer(): void {
    const messages = this.chat.messages();
    const last = messages[messages.length - 1];

    if (!this.autoAnswer() || this.mode() !== 'ai' || last?.sender !== 'user' || last.deletedAt) {
      return;
    }
    if (this.generating() || this.draft() || this.autoAnsweredMessageId === last.id) {
      return;
    }

    this.autoAnsweredMessageId = last.id;
    void this.generate();
  }

  protected changeMode(mode: ComposeMode): void {
    if (this.generating() || mode === this.mode()) {
      return;
    }
    this.chat.setAnswererMode(mode);
    if (mode === 'manual') {
      this.discardDraft();
    }
  }

  protected toggleAutoSend(event: Event): void {
    if (this.generating() || this.autoAnswer()) {
      return;
    }
    const enabled = (event.target as HTMLInputElement).checked;
    this.autoSend.set(enabled);
    sessionStorage.setItem(AUTO_SEND_KEY, String(enabled));
  }

  protected toggleAutoAnswer(event: Event): void {
    if (this.generating()) {
      return;
    }
    const enabled = (event.target as HTMLInputElement).checked;
    this.autoAnswer.set(enabled);
    sessionStorage.setItem(AUTO_ANSWER_KEY, String(enabled));
  }

  protected async generate(): Promise<void> {
    if (this.generating()) {
      return;
    }
    this.error.set(null);
    this.requestPending.set(true);
    try {
      const instruction = this.instruction.value.trim() || undefined;
      const result = await firstValueFrom(
        this.api.generateSuggestion(this.conversationId(), {
          instruction,
          autoSend: this.autoSendEffective(),
        }),
      );

      if (result.sent) {
        this.discardDraft();
        this.instruction.setValue('');
        return;
      }
      this.draft.set(result.suggestion);
      this.draftControl.setValue(result.suggestion.content);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Could not generate a suggestion.');
    } finally {
      this.requestPending.set(false);
    }
  }

  protected async sendDraft(): Promise<void> {
    const suggestion = this.draft();
    if (!suggestion || this.generating() || this.draftControl.invalid) {
      return;
    }
    const sent = await this.chat.send(this.draftControl.value, 'ai', suggestion.provider);
    if (sent) {
      this.discardDraft();
      this.instruction.setValue('');
    }
  }

  protected discardDraft(): void {
    this.draft.set(null);
    this.draftControl.setValue('');
    this.showPreview.set(false);
  }

  protected togglePreview(): void {
    this.showPreview.update((shown) => !shown);
  }

  protected onEditMessage({ id, content }: MessageEdit): void {
    void this.chat.editMessage(id, content);
  }

  protected onDeleteMessage(id: string): void {
    void this.chat.deleteMessage(id);
  }

  protected onInput(): void {
    this.chat.noteActivity(Boolean(this.form.controls.content.value.trim()));
  }

  protected onEnter(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.shiftKey) {
      return;
    }
    keyboardEvent.preventDefault();
    void this.submitManual();
  }

  protected async submitManual(): Promise<void> {
    if (this.generating() || this.form.invalid) {
      return;
    }
    const sent = await this.chat.send(this.form.controls.content.value, 'manual');
    if (sent) {
      this.form.reset({ content: '' });
    }
  }

  private setDisabled(control: AbstractControl, disabled: boolean): void {
    if (control.disabled === disabled) {
      return;
    }
    if (disabled) {
      control.disable({ emitEvent: false });
    } else {
      control.enable({ emitEvent: false });
    }
  }

  private restorePersistedMode(): void {
    const stored = sessionStorage.getItem(MODE_KEY) as ComposeMode | null;
    if ((stored === 'ai' || stored === 'manual') && stored !== this.chat.answererMode()) {
      this.chat.setAnswererMode(stored);
    }
  }
}

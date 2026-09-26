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
  type Message,
} from '../../core/contracts';
import { PanelChatService } from '../../core/panel-chat.service';
import { SocketService } from '../../core/socket.service';
import { MarkdownContentComponent } from '../markdown-content/markdown-content.component';
import type { MessageEdit } from '../message-bubble/message-bubble.component';
import { MessageThreadComponent } from '../message-thread/message-thread.component';
import { ModeToggleComponent } from '../mode-toggle/mode-toggle.component';

const COMPOSE_MODE_KEY = 'chat.answererMode';
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
  private readonly chatApi = inject(ChatApiService);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly messageMaxLength = MESSAGE_MAX_LENGTH;
  protected readonly instructionMaxLength = INSTRUCTION_MAX_LENGTH;

  protected readonly composerForm = this.formBuilder.nonNullable.group({
    content: ['', [Validators.required, Validators.maxLength(MESSAGE_MAX_LENGTH)]],
  });
  protected readonly instructionControl = this.formBuilder.nonNullable.control('', [
    Validators.maxLength(INSTRUCTION_MAX_LENGTH),
  ]);
  protected readonly draftControl = this.formBuilder.nonNullable.control('', [
    Validators.required,
    Validators.maxLength(MESSAGE_MAX_LENGTH),
  ]);

  private readonly contentValue = toSignal(this.composerForm.controls.content.valueChanges, {
    initialValue: '',
  });
  private readonly instructionValue = toSignal(this.instructionControl.valueChanges, {
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

  protected readonly draftSuggestion = signal<AiSuggestion | null>(null);
  protected readonly showPreview = signal(false);
  protected readonly generationError = signal<string | null>(null);
  protected readonly autoSend = signal(false);
  protected readonly autoAnswer = signal(false);
  private readonly ownRequestInFlight = signal(false);

  private lastAutoAnsweredMessageId: string | null = null;

  protected readonly composeMode = this.chat.answererMode;

  protected readonly sendsWithoutReview = computed(() => this.autoAnswer() || this.autoSend());

  protected readonly isGenerating = computed(
    () => this.ownRequestInFlight() || this.chat.isGeneratingReply(),
  );

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
        this.lastAutoAnsweredMessageId = null;
        void this.chat
          .joinConversation(id, 'answerer')
          .then(() => this.restorePersistedComposeMode());
      }
    });

    effect(() => sessionStorage.setItem(COMPOSE_MODE_KEY, this.chat.answererMode()));

    effect(() => {
      this.chat.messages();
      this.chat.markCounterpartMessagesRead();
    });

    effect(() => {
      const generating = this.isGenerating();
      this.setControlDisabled(this.composerForm.controls.content, generating);
      this.setControlDisabled(this.instructionControl, generating);
      this.setControlDisabled(this.draftControl, generating);
    });

    effect(() => this.answerPendingUserMessage());
  }

  private answerPendingUserMessage(): void {
    const messages = this.chat.messages();
    const enabled = this.autoAnswer();
    const mode = this.composeMode();
    const busy = this.isGenerating();
    const draft = this.draftSuggestion();

    const pendingMessageId = this.pendingUserMessageId(messages);

    if (!enabled || mode !== 'ai' || !pendingMessageId) {
      return;
    }
    if (busy || draft || this.lastAutoAnsweredMessageId === pendingMessageId) {
      return;
    }

    this.lastAutoAnsweredMessageId = pendingMessageId;
    void this.generateReply();
  }

  private pendingUserMessageId(messages: readonly Message[]): string | null {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index]!;
      if (message.sender === 'user' && !message.deletedAt) {
        return message.id;
      }
    }
    return null;
  }

  protected changeComposeMode(mode: ComposeMode): void {
    if (this.isGenerating() || mode === this.composeMode()) {
      return;
    }
    this.chat.setAnswererMode(mode);
    if (mode === 'manual') {
      this.discardDraft();
    }
  }

  protected toggleAutoSend(event: Event): void {
    if (this.isGenerating() || this.autoAnswer()) {
      return;
    }
    const enabled = (event.target as HTMLInputElement).checked;
    this.autoSend.set(enabled);
    sessionStorage.setItem(AUTO_SEND_KEY, String(enabled));
  }

  protected toggleAutoAnswer(event: Event): void {
    if (this.isGenerating()) {
      return;
    }
    const enabled = (event.target as HTMLInputElement).checked;
    this.autoAnswer.set(enabled);
    sessionStorage.setItem(AUTO_ANSWER_KEY, String(enabled));
  }

  protected async generateReply(): Promise<void> {
    if (this.isGenerating()) {
      return;
    }
    this.generationError.set(null);
    this.ownRequestInFlight.set(true);
    try {
      const instruction = this.instructionControl.value.trim() || undefined;
      const result = await firstValueFrom(
        this.chatApi.generateSuggestion(this.conversationId(), {
          instruction,
          autoSend: this.sendsWithoutReview(),
        }),
      );

      if (result.sent) {
        this.discardDraft();
        this.instructionControl.setValue('');
        return;
      }
      this.draftSuggestion.set(result.suggestion);
      this.draftControl.setValue(result.suggestion.content);
    } catch (error) {
      this.generationError.set(
        error instanceof Error ? error.message : 'Could not generate a suggestion.',
      );
    } finally {
      this.ownRequestInFlight.set(false);
    }
  }

  protected async sendDraftReply(): Promise<void> {
    const suggestion = this.draftSuggestion();
    if (!suggestion || this.isGenerating() || this.draftControl.invalid) {
      return;
    }
    const sent = await this.chat.sendMessage(this.draftControl.value, 'ai', suggestion.provider);
    if (sent) {
      this.discardDraft();
      this.instructionControl.setValue('');
    }
  }

  protected discardDraft(): void {
    this.draftSuggestion.set(null);
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

  protected onComposerInput(): void {
    this.chat.reportComposerActivity(Boolean(this.composerForm.controls.content.value.trim()));
  }

  protected onComposerEnter(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.shiftKey) {
      return;
    }
    keyboardEvent.preventDefault();
    void this.sendManualMessage();
  }

  protected async sendManualMessage(): Promise<void> {
    if (this.isGenerating() || this.composerForm.invalid) {
      return;
    }
    const sent = await this.chat.sendMessage(this.composerForm.controls.content.value, 'manual');
    if (sent) {
      this.composerForm.reset({ content: '' });
    }
  }

  private setControlDisabled(control: AbstractControl, disabled: boolean): void {
    if (control.disabled === disabled) {
      return;
    }
    if (disabled) {
      control.disable({ emitEvent: false });
    } else {
      control.enable({ emitEvent: false });
    }
  }

  private restorePersistedComposeMode(): void {
    const stored = sessionStorage.getItem(COMPOSE_MODE_KEY) as ComposeMode | null;
    if ((stored === 'ai' || stored === 'manual') && stored !== this.chat.answererMode()) {
      this.chat.setAnswererMode(stored);
    }
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  effect,
  input,
  output,
  viewChild,
  type ElementRef,
} from '@angular/core';
import type { Message, SenderRole } from '../../core/contracts';
import {
  MessageBubbleComponent,
  type MessageEdit,
} from '../message-bubble/message-bubble.component';

@Component({
  selector: 'app-message-thread',
  imports: [MessageBubbleComponent],
  templateUrl: './message-thread.component.html',
  host: { class: 'flex min-h-0 flex-1 flex-col' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MessageThreadComponent {
  readonly messages = input.required<Message[]>();
  readonly viewerRole = input.required<SenderRole>();
  readonly typingLabel = input<string | null>(null);
  readonly emptyHint = input('No messages yet.');
  readonly canModify = input(true);

  readonly editMessage = output<MessageEdit>();
  readonly deleteMessage = output<string>();

  private readonly scroller = viewChild<ElementRef<HTMLDivElement>>('scroller');

  constructor() {
    effect(() => {
      this.messages();
      this.typingLabel();
      const element = this.scroller()?.nativeElement;
      if (!element) {
        return;
      }
      requestAnimationFrame(() => {
        element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
      });
    });
  }
}

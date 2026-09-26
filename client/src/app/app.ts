import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ChatContainerComponent } from './components/chat-container/chat-container.component';

@Component({
  selector: 'app-root',
  imports: [ChatContainerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-chat-container />`,
})
export class App {}

import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { ComposeMode } from '../../core/contracts';

@Component({
  selector: 'app-mode-toggle',
  templateUrl: './mode-toggle.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModeToggleComponent {
  readonly mode = input.required<ComposeMode>();
  readonly disabled = input(false);
  readonly disabledHint = input<string | null>(null);
  readonly modeChange = output<ComposeMode>();

  protected readonly options: { value: ComposeMode; label: string }[] = [
    { value: 'manual', label: 'Manual' },
    { value: 'ai', label: 'AI' },
  ];
}

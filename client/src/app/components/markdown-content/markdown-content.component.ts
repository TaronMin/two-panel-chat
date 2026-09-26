import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  computed,
  inject,
  input,
} from '@angular/core';
import { MarkdownService } from '../../core/markdown.service';

@Component({
  selector: 'app-markdown-content',
  template: `<div class="md" [innerHTML]="html()"></div>`,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .md {
      min-width: 0;
      overflow-wrap: anywhere;
    }

    .md > :first-child {
      margin-top: 0;
    }
    .md > :last-child {
      margin-bottom: 0;
    }

    .md p,
    .md ul,
    .md ol,
    .md pre,
    .md blockquote,
    .md table {
      margin: 0.5em 0;
    }

    .md h1,
    .md h2,
    .md h3,
    .md h4,
    .md h5,
    .md h6 {
      margin: 0.8em 0 0.4em;
      font-weight: 600;
      line-height: 1.3;
    }
    .md h1 {
      font-size: 1.15em;
    }
    .md h2 {
      font-size: 1.08em;
    }
    .md h3,
    .md h4,
    .md h5,
    .md h6 {
      font-size: 1em;
    }

    .md ul,
    .md ol {
      padding-left: 1.35em;
    }
    .md ul {
      list-style: disc;
    }
    .md ol {
      list-style: decimal;
    }
    .md li {
      margin: 0.2em 0;
    }
    .md li > ul,
    .md li > ol {
      margin: 0.2em 0;
    }
    .md li::marker {
      color: currentColor;
      opacity: 0.65;
    }

    .md strong {
      font-weight: 600;
    }

    .md a {
      color: currentColor;
      text-decoration: underline;
      text-underline-offset: 2px;
    }
    .md a:hover {
      text-decoration-thickness: 2px;
    }

    .md code {
      border-radius: 0.25rem;
      background: rgb(0 0 0 / 0.1);
      padding: 0.1em 0.3em;
      font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
      font-size: 0.9em;
    }
    .md pre {
      max-width: 100%;
      overflow-x: auto;
      border-radius: 0.5rem;
      background: rgb(0 0 0 / 0.1);
      padding: 0.6em 0.75em;
    }
    .md pre code {
      background: none;
      padding: 0;
      font-size: 0.85em;
      overflow-wrap: normal;
    }

    .md blockquote {
      border-left: 2px solid rgb(127 127 127 / 0.4);
      padding-left: 0.7em;
      opacity: 0.85;
    }

    .md hr {
      border: 0;
      border-top: 1px solid currentColor;
      margin: 0.8em 0;
      opacity: 0.25;
    }

    .md table {
      display: block;
      overflow-x: auto;
      border-collapse: collapse;
    }
    .md th,
    .md td {
      border: 1px solid rgb(127 127 127 / 0.35);
      padding: 0.25em 0.5em;
      text-align: left;
    }

    .md img {
      max-width: 100%;
      border-radius: 0.5rem;
    }
  `,
})
export class MarkdownContentComponent {
  readonly content = input.required<string>();

  private readonly markdown = inject(MarkdownService);

  protected readonly html = computed(() => this.markdown.render(this.content()));
}

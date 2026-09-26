import { Injectable } from '@angular/core';
import { Marked } from 'marked';

function encodeHref(href: string): string | null {
  try {
    const encoded = encodeURI(href).replace(/%25/g, '%');
    return /^\s*(javascript|data|vbscript):/i.test(href) ? null : encoded;
  } catch {
    return null;
  }
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

@Injectable({ providedIn: 'root' })
export class MarkdownService {
  private readonly marked = new Marked({
    gfm: true,
    breaks: true,
    renderer: {
      link({ href, title, tokens }) {
        const text = this.parser.parseInline(tokens);
        const safeHref = encodeHref(href);
        if (safeHref === null) {
          return text;
        }
        const titleAttr = title ? ` title="${escapeAttribute(title)}"` : '';
        const hrefAttr = escapeAttribute(safeHref);
        return `<a href="${hrefAttr}"${titleAttr} target="_blank" rel="noreferrer">${text}</a>`;
      },
    },
  });

  render(markdown: string): string {
    return this.marked.parse(markdown.trim(), { async: false });
  }
}

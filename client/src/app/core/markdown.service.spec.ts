import { TestBed } from '@angular/core/testing';
import { MarkdownService } from './markdown.service';

describe('MarkdownService', () => {
  let markdown: MarkdownService;

  beforeEach(() => {
    markdown = TestBed.inject(MarkdownService);
  });

  describe('dangerous link schemes', () => {
    const blocked = [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      '  javascript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
      'vbscript:msgbox(1)',
    ];

    for (const href of blocked) {
      it(`drops the anchor for ${href.trim().split(':')[0]}`, () => {
        const html = markdown.render(`[click me](${href})`);

        expect(html).not.toContain('<a');
        expect(html).not.toContain('href=');
        expect(html).toContain('click me');
      });
    }

    it('keeps ordinary http and https links', () => {
      const html = markdown.render('[docs](https://example.com/a%20b)');

      expect(html).toContain('href="https://example.com/a%20b"');
      expect(html).toContain('target="_blank"');
      expect(html).toContain('rel="noreferrer"');
    });

    it('keeps relative and anchor links', () => {
      expect(markdown.render('[top](#section)')).toContain('href="#section"');
      expect(markdown.render('[page](/about)')).toContain('href="/about"');
    });
  });

  describe('attribute escaping', () => {
    it('escapes quotes and angle brackets in a link title', () => {
      const html = markdown.render('[x](https://example.com "a \\" b < c & d")');

      expect(html).toContain('title="a &quot; b &lt; c &amp; d"');
    });

    it('escapes ampersands in the href', () => {
      const html = markdown.render('[q](https://example.com/?a=1&b=2)');

      expect(html).toContain('&amp;b=2');
    });
  });

  describe('markdown rendering', () => {
    it('renders emphasis and inline code', () => {
      const html = markdown.render('**bold** and `code`');

      expect(html).toContain('<strong>bold</strong>');
      expect(html).toContain('<code>code</code>');
    });

    it('renders fenced code blocks', () => {
      const html = markdown.render('```ts\nconst x = 1;\n```');

      expect(html).toContain('<pre>');
      expect(html).toContain('const x = 1;');
    });

    it('renders GFM tables', () => {
      const html = markdown.render('| a | b |\n|---|---|\n| 1 | 2 |');

      expect(html).toContain('<table>');
      expect(html).toContain('<td>1</td>');
    });

    it('turns single newlines into breaks', () => {
      expect(markdown.render('one\ntwo')).toContain('<br>');
    });

    it('trims surrounding whitespace', () => {
      expect(markdown.render('   hello   ')).toContain('<p>hello</p>');
    });

    it('handles an empty string', () => {
      expect(markdown.render('')).toBe('');
    });
  });
});

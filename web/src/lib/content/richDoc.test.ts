import { describe, it, expect } from 'vitest';
import {
  countImagesMissingAlt,
  docFingerprint,
  isEmptyDoc,
  richDocSchema,
  sanitizeDoc,
  type RichDoc,
} from './richDoc';
import { markdownToDoc, parseInline } from './markdownToDoc';
import { docToMarkdown, docToPlainText } from './docToMarkdown';

describe('richDocSchema — the write-side gate (US-12.4)', () => {
  it('strips editor-only attributes the schema does not store', () => {
    // Tiptap's Link mark carries target/rel/class; the Image node carries
    // title. If these survived, the document the panel holds and the document
    // the database holds would be different objects and the drawer would
    // report every saved article as dirty. `width`/`height`, by contrast, ARE
    // in the schema (captured for the public page's layout-shift fix) and
    // must survive — see the next assertion.
    const { doc } = sanitizeDoc({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'قیمت',
              marks: [{ type: 'link', attrs: { href: '/prices', target: '_blank', rel: 'x', class: null } }],
            },
          ],
        },
        {
          type: 'image',
          attrs: { src: '/uploads/a.png', alt: 'میلگرد', title: 'ignored', width: 300, height: 150 },
        },
      ],
    });
    const link = (doc.content![0] as { content: Array<{ marks: Array<{ attrs: unknown }> }> }).content[0]!;
    expect(link.marks[0]!.attrs).toEqual({ href: '/prices' });
    expect(doc.content![1]).toEqual({
      type: 'image',
      attrs: { src: '/uploads/a.png', alt: 'میلگرد', caption: null, width: 300, height: 150 },
    });
  });

  it('rejects a javascript: href instead of storing it', () => {
    const res = richDocSchema.safeParse({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }],
        },
      ],
    });
    expect(res.success).toBe(false);
  });

  it('folds an absolute upload URL back to its same-origin path', () => {
    const { doc } = sanitizeDoc({
      type: 'doc',
      content: [{ type: 'image', attrs: { src: 'https://ahantime.com/uploads/x.webp', alt: 'الف' } }],
    });
    expect((doc.content![0] as { attrs: { src: string } }).attrs.src).toBe('/uploads/x.webp');
  });

  it('drops only the offending block, not the whole article', () => {
    const { doc, dropped } = sanitizeDoc({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'اول' }] },
        { type: 'codeBlock', content: [{ type: 'text', text: 'rm -rf' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'دوم' }] },
      ],
    });
    expect(dropped).toBe(1);
    expect(doc.content).toHaveLength(2);
    expect(docToPlainText(doc)).toBe('اول\n\nدوم');
  });

  it('pads a chart series that is shorter than its labels instead of failing', () => {
    // The data grid can legitimately be mid-edit when someone hits save.
    const { doc } = sanitizeDoc({
      type: 'doc',
      content: [
        {
          type: 'chart',
          attrs: {
            kind: 'line',
            title: 'روند',
            unit: 'تومان',
            labels: ['فروردین', 'اردیبهشت', 'خرداد'],
            series: [{ label: 'میلگرد', values: [10] }],
          },
        },
      ],
    });
    const attrs = (doc.content![0] as { attrs: { series: Array<{ values: unknown[] }> } }).attrs;
    expect(attrs.series[0]!.values).toEqual([10, null, null]);
  });

  it('refuses a chart with a fourth series', () => {
    const series = [1, 2, 3, 4].map((n) => ({ label: `س${n}`, values: [1] }));
    const res = richDocSchema.safeParse({
      type: 'doc',
      content: [{ type: 'chart', attrs: { kind: 'bar', title: '', unit: '', labels: ['x'], series } }],
    });
    expect(res.success).toBe(false);
  });
});

describe('docFingerprint', () => {
  it('ignores key order, which jsonb does not preserve', () => {
    const a = { type: 'doc', content: [{ type: 'image', attrs: { src: '/uploads/a.png', alt: 'x' } }] };
    const b = { content: [{ attrs: { alt: 'x', src: '/uploads/a.png' }, type: 'image' }], type: 'doc' };
    expect(docFingerprint(a)).toBe(docFingerprint(b));
  });

  it('still notices a real content change', () => {
    const a = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'الف' }] }] };
    const b = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'ب' }] }] };
    expect(docFingerprint(a)).not.toBe(docFingerprint(b));
  });
});

describe('countImagesMissingAlt', () => {
  it('counts images with no description and no decorative flag', () => {
    const doc: RichDoc = {
      type: 'doc',
      content: [
        { type: 'image', attrs: { src: '/uploads/a.png', alt: '' } },
        { type: 'image', attrs: { src: '/uploads/b.png', alt: '', decorative: true } },
        { type: 'image', attrs: { src: '/uploads/c.png', alt: 'تیرآهن' } },
      ],
    };
    expect(countImagesMissingAlt(doc)).toBe(1);
  });
});

describe('isEmptyDoc', () => {
  it('treats ProseMirror’s single empty paragraph as empty', () => {
    expect(isEmptyDoc({ type: 'doc', content: [{ type: 'paragraph' }] })).toBe(true);
    expect(isEmptyDoc({ type: 'doc', content: [] })).toBe(true);
    expect(isEmptyDoc(null)).toBe(true);
    expect(isEmptyDoc({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }] })).toBe(
      false,
    );
  });
});

describe('parseInline', () => {
  it('merges the character captured before an italic run back into its neighbour', () => {
    // The italic branch captures the preceding character only so it can be
    // tested; leaving it as its own node would split «الف» in two.
    expect(parseInline('الف*ب* پایان')).toEqual([
      { type: 'text', text: 'الف' },
      { type: 'text', text: 'ب', marks: [{ type: 'italic' }] },
      { type: 'text', text: ' پایان' },
    ]);
  });
});

describe('markdown ⇄ document round trip', () => {
  const md = [
    'پاراگراف اول با **تأکید** و یک [پیوند](/prices).',
    '',
    '## عنوان بخش',
    '',
    '- مورد اول',
    '- مورد دوم',
    '',
    '1. گام اول',
    '2. گام دوم',
    '',
    '> یک نقل‌قول',
    '',
    '| سایز | وزن |',
    '| --- | --- |',
    '| ۱۴ | ۱٫۲۱ |',
  ].join('\n');

  it('survives markdown → document → markdown unchanged', () => {
    // This is the guarantee the backfill script leans on: converting a stored
    // body to a document cannot change what the article says.
    expect(docToMarkdown(markdownToDoc(md))).toBe(md);
  });

  it('keeps a chart searchable in the derived markdown mirror', () => {
    // `body_md` still backs site search, the AI advisor's guide grounding and
    // the SEO word count — a chart's title and numbers have to reach it.
    const doc: RichDoc = {
      type: 'doc',
      content: [
        {
          type: 'chart',
          attrs: {
            kind: 'bar',
            title: 'قیمت میلگرد',
            unit: 'تومان',
            labels: ['فروردین', 'اردیبهشت'],
            series: [{ label: 'اصفهان', values: [24000, null] }],
            source: 'بورس کالا',
          },
        },
      ],
    };
    const out = docToMarkdown(doc);
    expect(out).toContain('قیمت میلگرد (تومان)');
    expect(out).toContain('| فروردین | 24000 |');
    // A gap must not read as a zero.
    expect(out).toContain('| اردیبهشت | — |');
    expect(out).toContain('منبع: بورس کالا');
  });

  it('never lets a cell’s own pipe re-split the row it is in', () => {
    const doc: RichDoc = {
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'الف|ب' }] }] },
                { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'ج' }] }] },
              ],
            },
          ],
        },
      ],
    };
    const md2 = docToMarkdown(doc);
    expect(md2.split('\n')[0]).toBe('| الف｜ب | ج |');
  });

  it('carries an image caption into the mirror as its own chunk', () => {
    const doc: RichDoc = {
      type: 'doc',
      content: [{ type: 'image', attrs: { src: '/uploads/a.png', alt: 'میلگرد', caption: 'انبار مرکزی' } }],
    };
    const out = docToMarkdown(doc);
    expect(out).toBe('![میلگرد](/uploads/a.png)\n\nانبار مرکزی');
    // …and reading it back keeps the image an image, not a paragraph.
    expect(markdownToDoc(out).content![0]!.type).toBe('image');
  });
});

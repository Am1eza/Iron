/**
 * On-page SEO audit (US-14.4).
 *
 * The checks that matter here are the PERSIAN ones. Length arithmetic is
 * arithmetic; what a hand-rolled analyser gets wrong is the language:
 * substring matches that fire inside a longer word, ZWNJ spellings that fail
 * to match their spaced twin, Arabic ك/ي that never match their Persian
 * forms, and a passive detector that flags «آماده شد». Each of those has a
 * case below, because each of them hands a writer a wrong answer with a
 * confident green dot on it.
 */
import { describe, it, expect } from 'vitest';
import type { RichDoc } from '@/lib/content/richDoc';
import {
  auditArticleSeo,
  collectBodyStats,
  containsKeyword,
  countSequence,
  looksPassive,
  splitSentences,
  tokenize,
  type SeoCheckId,
  type SeoCheckStatus,
} from './onPageAudit';

/* ------------------------------- helpers -------------------------------- */

const p = (text: string): RichDoc['content'] extends undefined ? never : NonNullable<RichDoc['content']>[number] =>
  ({ type: 'paragraph', content: [{ type: 'text', text }] }) as never;

const h = (level: 2 | 3, text: string) =>
  ({ type: 'heading', attrs: { level }, content: [{ type: 'text', text }] }) as never;

const link = (text: string, href: string) =>
  ({
    type: 'paragraph',
    content: [{ type: 'text', text, marks: [{ type: 'link', attrs: { href } }] }],
  }) as never;

const img = (alt: string, decorative = false) =>
  ({ type: 'image', attrs: { src: '/uploads/x.jpg', alt, decorative } }) as never;

function doc(...blocks: unknown[]): RichDoc {
  return { type: 'doc', content: blocks as NonNullable<RichDoc['content']> };
}

/** Repeat a filler word n times as one paragraph's worth of body text. */
function words(n: number, word = 'فولاد'): string {
  return Array.from({ length: n }, () => word).join(' ');
}

const BASE = {
  title: 'راهنمای خرید میلگرد ساختمانی برای پروژه‌های عمرانی',
  seoTitle: '',
  seoDescription: '',
  excerpt: '',
  slug: 'راهنمای-خرید-میلگرد',
  focusKeyword: '',
  doc: null as RichDoc | null,
};

function statusOf(input: Partial<typeof BASE>, id: SeoCheckId): SeoCheckStatus {
  const result = auditArticleSeo({ ...BASE, ...input });
  const check = result.checks.find((c) => c.id === id);
  if (!check) throw new Error(`no check ${id}`);
  return check.status;
}

/* ------------------------------ tokenising ------------------------------ */

describe('tokenize', () => {
  it('splits on Persian punctuation and drops it', () => {
    expect(tokenize('قیمت میلگرد، امروز؟')).toEqual(['قیمت', 'میلگرد', 'امروز']);
  });

  it('treats ZWNJ as word-INTERNAL, so an enclitic stays with its stem', () => {
    // The bug this replaced: ZWNJ folded to a space split «ورق‌های» into
    // [ورق][های], and the keyword «ورق گالوانیزه» — which needs adjacency —
    // then matched nothing in an article entirely about it.
    expect(tokenize('ورق‌های گالوانیزه')).toEqual(['ورق', 'گالوانیزه']);
    // One token, with آ folded to ا by the hamza normalisation above.
    expect(tokenize('قیمت‌آهن')).toEqual(['قیمتاهن']);
  });

  it('strips Persian enclitics so an inflected word matches its stem', () => {
    expect(tokenize('ورق‌ها')).toEqual(['ورق']);
    expect(tokenize('ورق‌هایی')).toEqual(['ورق']);
    expect(tokenize('ارزان‌ترین')).toEqual(['ارزان']);
  });

  it('will not strip a suffix that is really part of a short word', () => {
    // «دفتر» must not become «دف»; the three-letter stem floor is what stops it.
    expect(tokenize('دفتر')).toEqual(['دفتر']);
    expect(tokenize('نشان')).toEqual(['نشان']);
  });

  it('folds hamza carriers so «تأمین» and «تامین» are one word', () => {
    expect(tokenize('تأمین')).toEqual(tokenize('تامین'));
    expect(tokenize('آهن')).toEqual(tokenize('اهن'));
  });

  it('folds Arabic ك/ي to their Persian forms', () => {
    // Typed on an Arabic layout vs a Persian one — visually identical.
    expect(tokenize('كيفيت')).toEqual(tokenize('کیفیت'));
  });

  it('folds all THREE digit sets to one — the size IS the keyword here', () => {
    expect(tokenize('میلگرد ۱۴')).toEqual(['میلگرد', '۱۴']);
    expect(tokenize('میلگرد ١٤')).toEqual(['میلگرد', '۱۴']); // Arabic-Indic
    expect(tokenize('میلگرد 14')).toEqual(['میلگرد', '۱۴']); // ASCII
  });
});

describe('countSequence', () => {
  it('counts non-overlapping occurrences of a multi-word phrase', () => {
    expect(countSequence(['قیمت', 'آهن', 'و', 'قیمت', 'آهن'], ['قیمت', 'آهن'])).toBe(2);
  });

  it('does not count an overlapping repeat twice', () => {
    expect(countSequence(['آهن', 'آهن', 'آهن'], ['آهن', 'آهن'])).toBe(1);
  });

  it('is empty-safe', () => {
    expect(countSequence(['آهن'], [])).toBe(0);
    expect(countSequence([], ['آهن'])).toBe(0);
  });

  it('joins in both directions for a ZWNJ compound', () => {
    // keyword written apart, body written joined
    expect(countSequence(['قیمتاهن', 'امروز'], ['قیمت', 'اهن'])).toBe(1);
    // keyword written joined, body written apart
    expect(countSequence(['امروز', 'قیمت', 'اهن'], ['قیمتاهن'])).toBe(1);
  });

  it('does not join tokens that merely start the same', () => {
    expect(countSequence(['قیمت', 'اهنگر'], ['قیمتاهن'])).toBe(0);
  });
});

describe('containsKeyword', () => {
  it('matches on WORD boundaries, not substrings', () => {
    // The whole reason tokens exist: «آهن» is inside «آهنگ», and a naive
    // `includes()` would report the keyword as present in a body about music.
    expect(containsKeyword('یک آهنگ زیبا', tokenize('آهن'))).toBe(false);
    expect(containsKeyword('قیمت آهن امروز', tokenize('آهن'))).toBe(true);
  });

  it('requires the phrase words to be adjacent and in order', () => {
    expect(containsKeyword('قیمت روز آهن', tokenize('قیمت آهن'))).toBe(false);
    expect(containsKeyword('امروز قیمت آهن بالا رفت', tokenize('قیمت آهن'))).toBe(true);
  });

  it('matches across a ZWNJ spelling difference in either direction', () => {
    // Recovered in `countSequence`, which also accepts the keyword's words
    // written joined — the compound case ZWNJ-as-space used to buy.
    expect(containsKeyword('امروز قیمت‌آهن بالا رفت', tokenize('قیمت آهن'))).toBe(true);
    expect(containsKeyword('امروز قیمت آهن بالا رفت', tokenize('قیمت‌آهن'))).toBe(true);
  });

  it('matches a keyword through a plural enclitic on the body', () => {
    expect(containsKeyword('قیمت ورق‌های گالوانیزه امروز', tokenize('ورق گالوانیزه'))).toBe(true);
  });

  it('matches an ASCII-typed size against a Persian-typed one', () => {
    expect(containsKeyword('قیمت ورق 2 میل', tokenize('ورق ۲ میل'))).toBe(true);
  });
});

/* --------------------------- document walking --------------------------- */

describe('collectBodyStats', () => {
  it('collects paragraphs, headings, links and images in order', () => {
    const stats = collectBodyStats(
      doc(p('پاراگراف اول'), h(2, 'تیتر میانی'), link('صفحهٔ قیمت', '/prices'), img('میلگرد در انبار')),
    );
    expect(stats.paragraphs).toEqual(['پاراگراف اول', 'صفحهٔ قیمت']);
    expect(stats.headings).toEqual([{ level: 2, text: 'تیتر میانی' }]);
    expect(stats.links).toEqual(['/prices']);
    expect(stats.images).toEqual([{ alt: 'میلگرد در انبار', decorative: false }]);
  });

  it('descends into lists and blockquotes — those are paragraphs to a reader', () => {
    const stats = collectBodyStats(
      doc(
        {
          type: 'bulletList',
          content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'مورد اول' }] }] }],
        },
        { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'نقل قول' }] }] },
      ),
    );
    expect(stats.paragraphs).toEqual(['مورد اول', 'نقل قول']);
  });

  it('counts table text as body words but not as a paragraph', () => {
    const stats = collectBodyStats(
      doc({
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'سایز ۱۴' }] }] }],
          },
        ],
      }),
    );
    expect(stats.paragraphs).toEqual([]);
    expect(stats.text).toContain('سایز ۱۴');
  });

  it('is null-safe for an article with no body yet', () => {
    expect(collectBodyStats(null).paragraphs).toEqual([]);
  });
});

/* ------------------------------- passives ------------------------------- */

describe('looksPassive', () => {
  it('flags the ordinary Persian passive forms', () => {
    expect(looksPassive('این گزارش دیروز نوشته شد.')).toBe(true);
    expect(looksPassive('میلگرد در کارخانه ساخته می‌شود')).toBe(true);
    expect(looksPassive('قیمت‌ها بررسی شده است')).toBe(true);
    expect(looksPassive('سفارش‌ها ثبت شدند')).toBe(true);
  });

  it('matches the spaced spelling of «می شود» as well as the ZWNJ one', () => {
    expect(looksPassive('این کار انجام می شود')).toBe(true);
  });

  it('does not flag an active sentence', () => {
    expect(looksPassive('ما دیروز این گزارش را نوشتیم.')).toBe(false);
    expect(looksPassive('کارخانه میلگرد تولید می‌کند')).toBe(false);
  });

  it('does not flag inchoative «آماده شد» — becoming, not being acted on', () => {
    expect(looksPassive('سفارش آماده شد')).toBe(false);
    expect(looksPassive('کارگر خسته شده بود')).toBe(false);
  });

  it('sees a ZWNJ-joined participle — the typographically correct spelling', () => {
    expect(looksPassive('گزارش نوشته‌شده است')).toBe(true);
    expect(looksPassive('قیمت‌ها اعلام‌شده‌اند')).toBe(true);
  });

  it('sees NEGATED passives, which are just as passive', () => {
    expect(looksPassive('سفارش ثبت نشده است')).toBe(true);
    expect(looksPassive('قیمت اعلام نمی‌شود')).toBe(true);
    expect(looksPassive('نمایشگاه برگزار نخواهد شد')).toBe(true);
  });

  it('does not let «شد» fire inside a first-person «شدم»', () => {
    // An article is third-person; «شدم» must not read as a passive auxiliary.
    expect(looksPassive('من خیلی خسته شدم')).toBe(false);
    expect(looksPassive('من از این نتیجه ناامید شدم')).toBe(false);
  });
});

describe('boundary values for the length bands', () => {
  // The bands are adjacent, so a `>` that should be `>=` moves a value into the
  // wrong colour silently. Every boundary is pinned rather than sampled.
  const cases: Array<[number, SeoCheckStatus]> = [
    [39, 'bad'], [40, 'warn'], [49, 'warn'], [50, 'good'],
    [60, 'good'], [61, 'warn'], [70, 'warn'], [71, 'bad'],
  ];
  it.each(cases)('a %i-character title is %s', (n, expected) => {
    expect(statusOf({ seoTitle: 'ی'.repeat(n) }, 'titleLength')).toBe(expected);
  });

  const descCases: Array<[number, SeoCheckStatus]> = [
    [79, 'bad'], [80, 'warn'], [119, 'warn'], [120, 'good'],
    [160, 'good'], [161, 'warn'], [180, 'warn'], [181, 'bad'],
  ];
  it.each(descCases)('a %i-character description is %s', (n, expected) => {
    expect(statusOf({ seoDescription: 'ی'.repeat(n) }, 'descriptionLength')).toBe(expected);
  });
});

describe('splitSentences', () => {
  it('splits on Persian and Latin terminators and on newlines', () => {
    expect(splitSentences('یک. دو؟ سه؛\nچهار')).toEqual(['یک', 'دو', 'سه', 'چهار']);
  });
});

/* --------------------------------- audit -------------------------------- */

describe('auditArticleSeo — keyword checks', () => {
  it('parks every keyword check as idle (not failed) with no focus keyword', () => {
    const result = auditArticleSeo({ ...BASE, doc: doc(p(words(80))) });
    expect(result.checks.find((c) => c.id === 'focusKeyword')!.status).toBe('bad');
    for (const id of ['keywordInTitle', 'keywordInSlug', 'keywordInHeading', 'keywordDensity'] as SeoCheckId[]) {
      expect(result.checks.find((c) => c.id === id)!.status).toBe('idle');
    }
  });

  it('finds the keyword in the title, the slug, the first paragraph and a heading', () => {
    const input = {
      ...BASE,
      focusKeyword: 'قیمت میلگرد',
      title: 'قیمت میلگرد امروز',
      slug: 'قیمت-میلگرد-امروز',
      doc: doc(p('قیمت میلگرد امروز اعلام شد و بازار واکنش نشان داد.'), h(2, 'نمودار قیمت میلگرد')),
    };
    expect(statusOf(input, 'keywordInTitle')).toBe('good');
    expect(statusOf(input, 'keywordInSlug')).toBe('good');
    expect(statusOf(input, 'keywordInFirstParagraph')).toBe('good');
    expect(statusOf(input, 'keywordInHeading')).toBe('good');
  });

  it('reads the slug through its hyphens rather than as one long word', () => {
    expect(statusOf({ ...BASE, focusKeyword: 'خرید میلگرد', slug: 'راهنمای-خرید-میلگرد' }, 'keywordInSlug')).toBe('good');
  });

  it('does not credit a keyword that only appears inside a longer word', () => {
    expect(
      statusOf({ ...BASE, focusKeyword: 'آهن', title: 'آهنگ‌های محبوب کارگاه' }, 'keywordInTitle'),
    ).toBe('bad');
  });

  it('prefers the SEO title override when one is set', () => {
    expect(
      statusOf({ ...BASE, focusKeyword: 'ورق گالوانیزه', title: 'یک عنوان دیگر', seoTitle: 'قیمت ورق گالوانیزه' }, 'keywordInTitle'),
    ).toBe('good');
  });
});

describe('auditArticleSeo — density', () => {
  const dense = (occurrences: number, total: number) =>
    auditArticleSeo({
      ...BASE,
      focusKeyword: 'میلگرد',
      doc: doc(p([...Array(occurrences).fill('میلگرد'), words(total - occurrences)].join(' '))),
    }).checks.find((c) => c.id === 'keywordDensity')!;

  it('stays idle while the body is too short to mean anything', () => {
    expect(dense(1, 20).status).toBe('idle');
  });

  it('is good inside the ideal band', () => {
    expect(dense(2, 200).status).toBe('good'); // 1%
  });

  it('warns when the keyword is barely there', () => {
    expect(dense(1, 250).status).toBe('warn'); // 0.4%
  });

  it('fails an obviously stuffed body', () => {
    expect(dense(40, 200).status).toBe('bad'); // 20%
  });

  it('fails a body the keyword never appears in at all', () => {
    const check = auditArticleSeo({ ...BASE, focusKeyword: 'میلگرد', doc: doc(p(words(100, 'ورق'))) }).checks.find(
      (c) => c.id === 'keywordDensity',
    )!;
    expect(check.status).toBe('bad');
  });

  it('does not punish a multi-word keyword for its length', () => {
    // 8 mentions of a three-word phrase in ~600 words is one mention per 75
    // words — sparse. Weighting by phrase length graded this 4% and called it
    // keyword stuffing; counting mentions puts it at 1.3%, which is right.
    const check = auditArticleSeo({
      ...BASE,
      focusKeyword: 'قیمت میلگرد اصفهان',
      doc: doc(p([...Array(8).fill('قیمت میلگرد اصفهان'), words(576)].join(' '))),
    }).checks.find((c) => c.id === 'keywordDensity')!;
    expect(check.status).toBe('good');
  });

  it('grades the percentage it actually displays', () => {
    // 2/670 = 0.2985%, which rounds to the «۰٫۳٪» shown on screen. Grading the
    // unrounded value told the writer «۰٫۳٪ — below the 0.3% floor».
    const check = auditArticleSeo({
      ...BASE,
      focusKeyword: 'میلگرد',
      doc: doc(p([...Array(2).fill('میلگرد'), words(668)].join(' '))),
    }).checks.find((c) => c.id === 'keywordDensity')!;
    expect(check.status).toBe('warn');
    expect(check.message).toContain('۰٫۳٪');
  });
});

describe('auditArticleSeo — lengths', () => {
  it('grades the SERP title by its length', () => {
    expect(statusOf({ seoTitle: 'ی'.repeat(55) }, 'titleLength')).toBe('good');
    expect(statusOf({ seoTitle: 'ی'.repeat(45) }, 'titleLength')).toBe('warn');
    expect(statusOf({ seoTitle: 'ی'.repeat(20) }, 'titleLength')).toBe('bad');
    expect(statusOf({ title: '', seoTitle: '' }, 'titleLength')).toBe('bad');
  });

  it('falls back to the excerpt when no SEO description is set', () => {
    expect(statusOf({ excerpt: 'ی'.repeat(140) }, 'descriptionLength')).toBe('good');
    expect(statusOf({ excerpt: '', seoDescription: '' }, 'descriptionLength')).toBe('bad');
  });

  it('counts characters by code point, not UTF-16 unit', () => {
    // An emoji pasted into a title is two UTF-16 units and one character; the
    // naive `.length` would report a 60-char title as 70 and fail it.
    // 60 code points / 61 UTF-16 units: `good` by code point, `warn` by
    // `.length`. The earlier version used 56/57, which is inside the ideal
    // band either way and so could not fail.
    const title = `${'ی'.repeat(59)}🙂`;
    expect(statusOf({ seoTitle: title }, 'titleLength')).toBe('good');
  });
});

describe('auditArticleSeo — structure', () => {
  it('flags a wall of text', () => {
    expect(statusOf({ doc: doc(p(words(250))) }, 'paragraphLength')).toBe('bad');
    expect(statusOf({ doc: doc(p(words(150))) }, 'paragraphLength')).toBe('warn');
    expect(statusOf({ doc: doc(p(words(60)), p(words(60))) }, 'paragraphLength')).toBe('good');
  });

  it('warns about a body with no links at all, and about external-only links', () => {
    expect(statusOf({ doc: doc(p('متن')) }, 'linkCount')).toBe('warn');
    expect(statusOf({ doc: doc(link('منبع', 'https://example.com')) }, 'linkCount')).toBe('warn');
    expect(statusOf({ doc: doc(link('قیمت‌ها', '/prices')) }, 'linkCount')).toBe('good');
  });

  it('counts images with a deliberate decorative mark as described', () => {
    expect(statusOf({ doc: doc(img('میلگرد در انبار')) }, 'imageAlt')).toBe('good');
    expect(statusOf({ doc: doc(img('', true)) }, 'imageAlt')).toBe('good');
    expect(statusOf({ doc: doc(img('')) }, 'imageAlt')).toBe('bad');
    expect(statusOf({ doc: doc(img('توضیح'), img('')) }, 'imageAlt')).toBe('warn');
    expect(statusOf({ doc: doc(p('بدون تصویر')) }, 'imageAlt')).toBe('idle');
  });

  it('grades passive voice as a ratio, and stays idle on a short body', () => {
    expect(statusOf({ doc: doc(p('یک جمله نوشته شد.')) }, 'passiveVoice')).toBe('idle');
    const active = 'کارخانه میلگرد تولید می‌کند. ما قیمت را اعلام کردیم. بازار واکنش نشان داد. خریدار سفارش داد.';
    expect(statusOf({ doc: doc(p(active)) }, 'passiveVoice')).toBe('good');
    const passive = 'گزارش نوشته شد. قیمت اعلام شد. سفارش ثبت شد. بررسی انجام شد.';
    expect(statusOf({ doc: doc(p(passive)) }, 'passiveVoice')).toBe('bad');
  });
});

describe('auditArticleSeo — regressions the review found', () => {
  it('counts one link split across text nodes as ONE link', () => {
    // Tiptap splits a link's text node at every mark boundary; counting each
    // node reported «۳ پیوند داخلی» for a single link.
    const stats = collectBodyStats(
      doc({
        type: 'paragraph',
        content: [
          { type: 'text', text: 'برو به ' },
          { type: 'text', text: 'صفحه', marks: [{ type: 'link', attrs: { href: '/prices' } }] },
          { type: 'text', text: 'قیمت', marks: [{ type: 'link', attrs: { href: '/prices' } }, { type: 'bold' }] },
        ],
      }),
    );
    expect(stats.links).toEqual(['/prices']);
  });

  it('still counts two SEPARATE links to the same destination', () => {
    const stats = collectBodyStats(
      doc({
        type: 'paragraph',
        content: [
          { type: 'text', text: 'اینجا', marks: [{ type: 'link', attrs: { href: '/prices' } }] },
          { type: 'text', text: ' و ' },
          { type: 'text', text: 'اینجا', marks: [{ type: 'link', attrs: { href: '/prices' } }] },
        ],
      }),
    );
    expect(stats.links).toEqual(['/prices', '/prices']);
  });

  it('does not call an article of headings and tables «خالی»', () => {
    const tableDoc = doc(
      h(2, 'جدول قیمت میلگرد امروز'),
      {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'سایز ۱۴ قیمت ۲۵ هزار' }] }] }],
          },
        ],
      },
    );
    const result = auditArticleSeo({ ...BASE, focusKeyword: 'میلگرد', doc: tableDoc });
    expect(result.wordCount).toBeGreaterThan(0);
    for (const id of ['keywordInFirstParagraph', 'paragraphLength'] as SeoCheckId[]) {
      expect(result.checks.find((c) => c.id === id)!.message).not.toContain('خالی');
    }
  });

  it('does not count table cells and headings as sentences for the passive ratio', () => {
    // Two prose sentences, both passive, plus a table full of non-sentences.
    const cell = (text: string) => ({
      type: 'tableRow',
      content: [{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }],
    });
    const mixed = doc(
      p('گزارش نوشته شد. قیمت اعلام شد. سفارش ثبت شد. بررسی انجام شد.'),
      { type: 'table', content: [cell('سایز'), cell('وزن'), cell('قیمت'), cell('موجودی'), cell('کارخانه'), cell('واحد')] },
    );
    expect(
      auditArticleSeo({ ...BASE, doc: mixed }).checks.find((c) => c.id === 'passiveVoice')!.status,
    ).toBe('bad');
  });

  it('grades the middle passive band, not just 0% and 100%', () => {
    // 1 passive in 5 sentences = 20%, inside (0.15, 0.25].
    const text =
      'گزارش نوشته شد. ما قیمت را اعلام کردیم. بازار واکنش نشان داد. خریدار سفارش داد. کارخانه تولید را بالا برد.';
    expect(statusOf({ doc: doc(p(text)) }, 'passiveVoice')).toBe('warn');
  });
});

describe('auditArticleSeo — summary', () => {
  it('reports the worst non-idle status as the overall light', () => {
    const result = auditArticleSeo({ ...BASE, focusKeyword: 'میلگرد', doc: doc(p(words(100))) });
    expect(result.overall).toBe('bad'); // the keyword is not in the body
    expect(result.counts.good + result.counts.warn + result.counts.bad + result.counts.idle).toBe(
      result.checks.length,
    );
  });

  it('never returns a check without a Persian message', () => {
    const result = auditArticleSeo({ ...BASE, focusKeyword: 'میلگرد', doc: doc(p(words(100, 'میلگرد'))) });
    for (const check of result.checks) {
      expect(check.message.trim().length).toBeGreaterThan(0);
      expect(check.label.trim().length).toBeGreaterThan(0);
    }
  });

  it('survives an empty article without throwing', () => {
    const result = auditArticleSeo({ ...BASE, title: '', slug: '', doc: null });
    expect(result.checks.length).toBeGreaterThan(0);
    expect(result.wordCount).toBe(0);
  });
});

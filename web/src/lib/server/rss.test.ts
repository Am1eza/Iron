import { describe, it, expect } from 'vitest';
import { buildRssFeed, esc, RSS_ITEM_LIMIT } from './rss';
import type { Article } from '@/lib/types/domain';

function article(over: Partial<Article> = {}): Article {
  return {
    id: 'a1',
    slug: 'rebar-guide',
    type: 'blog',
    title: 'راهنمای میلگرد',
    excerpt: 'خلاصه',
    status: 'published',
    source: 'human',
    publishAt: '2026-01-12T08:00:00.000Z',
    updatedAt: '2026-01-13T09:30:00.000Z',
    ...over,
  };
}

describe('esc', () => {
  it('escapes every one of the five XML entities', () => {
    expect(esc(`& < > " '`)).toBe('&amp; &lt; &gt; &quot; &apos;');
  });

  it('escapes & FIRST, so an escaped entity is never double-escaped', () => {
    expect(esc('a & b')).toBe('a &amp; b');
    expect(esc('&amp;')).toBe('&amp;amp;');
    expect(esc(esc('&'))).toBe('&amp;amp;');
  });

  it('handles a real Persian title carrying all five characters at once', () => {
    expect(esc(`میلگرد ۱۴ & ۱۶ <"ذوب آهن"> 'اصفهان'`)).toBe(
      'میلگرد ۱۴ &amp; ۱۶ &lt;&quot;ذوب آهن&quot;&gt; &apos;اصفهان&apos;',
    );
  });

  it('strips C0 control characters — XML 1.0 cannot represent them at all', () => {
    expect(esc('میلگرد\u0000\u0008\u001F آجدار')).toBe('میلگرد آجدار');
  });

  it('leaves tab, newline and carriage return alone — those are legal XML', () => {
    expect(esc('a\tb\nc\rd')).toBe('a\tb\nc\rd');
  });

  it('leaves ordinary Persian text untouched', () => {
    expect(esc('میلگرد آجدار ۱۴')).toBe('میلگرد آجدار ۱۴');
  });
});

describe('buildRssFeed', () => {
  const base = {
    title: 'وبلاگ آهن‌تایم',
    description: 'راهنمای خرید',
    pagePath: '/blog',
    feedPath: '/blog/rss.xml',
    hrefFor: (slug: string) => `/blog/${slug}`,
  };

  it('emits a well-formed RSS 2.0 channel with the required elements', () => {
    const xml = buildRssFeed({ ...base, articles: [article()] });
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">');
    expect(xml).toContain('<language>fa-IR</language>');
    expect(xml).toContain('<title>وبلاگ آهن‌تایم</title>');
    expect(xml).toContain(
      '<atom:link href="https://ahantime.com/blog/rss.xml" rel="self" type="application/rss+xml" />',
    );
  });

  it('builds absolute permalinks and a self-referential permaLink guid', () => {
    const xml = buildRssFeed({ ...base, articles: [article()] });
    expect(xml).toContain('<link>https://ahantime.com/blog/rebar-guide</link>');
    expect(xml).toContain('<guid isPermaLink="true">https://ahantime.com/blog/rebar-guide</guid>');
  });

  it('emits RFC-822 dates: pubDate from publishAt, lastBuildDate from the newest updatedAt', () => {
    const xml = buildRssFeed({
      ...base,
      articles: [
        article({ id: 'a1', updatedAt: '2026-01-13T09:30:00.000Z' }),
        article({ id: 'a2', slug: 'older', updatedAt: '2026-02-01T00:00:00.000Z' }),
      ],
    });
    expect(xml).toContain('<pubDate>Mon, 12 Jan 2026 08:00:00 GMT</pubDate>');
    expect(xml).toContain('<lastBuildDate>Sun, 01 Feb 2026 00:00:00 GMT</lastBuildDate>');
  });

  it('escapes a title containing &, <, >, " and \' — the silent-empty-feed bug', () => {
    const xml = buildRssFeed({
      ...base,
      articles: [article({ title: `میلگرد & نبشی <b>"ویژه"</b> 'ذوب آهن'` })],
    });
    expect(xml).toContain(
      '<title>میلگرد &amp; نبشی &lt;b&gt;&quot;ویژه&quot;&lt;/b&gt; &apos;ذوب آهن&apos;</title>',
    );
    // Nothing outside the markup itself may contain a bare < or &.
    expect(xml).not.toContain('<b>');
    expect(xml).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;)/);
  });

  it('escapes the excerpt and the channel description too, not just titles', () => {
    const xml = buildRssFeed({
      ...base,
      description: 'خرید & فروش',
      articles: [article({ excerpt: 'نرخ < ۱۰۰ & بالاتر' })],
    });
    expect(xml).toContain('<description>خرید &amp; فروش</description>');
    expect(xml).toContain('<description>نرخ &lt; ۱۰۰ &amp; بالاتر</description>');
  });

  it('escapes a slug that would otherwise break the guid attribute', () => {
    const xml = buildRssFeed({ ...base, articles: [article({ slug: 'a&b' })] });
    expect(xml).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;)/);
  });

  it('omits pubDate and description when the article has neither', () => {
    const xml = buildRssFeed({
      ...base,
      articles: [article({ publishAt: undefined, excerpt: undefined })],
    });
    expect(xml).not.toContain('<pubDate>');
    expect(xml.match(/<description>/g)).toHaveLength(1); // the channel's only
  });

  it('still produces a valid empty channel with no articles', () => {
    const xml = buildRssFeed({ ...base, articles: [] });
    expect(xml).toContain('<channel>');
    expect(xml).not.toContain('<item>');
    expect(xml).toContain('<lastBuildDate>');
  });

  it('caps at a bounded item count — a feed is a window, not an archive', () => {
    expect(RSS_ITEM_LIMIT).toBe(50);
  });
});

/** Pure-math units for the admin analytics — the formulas an auditor checks. */
import { describe, it, expect } from 'vitest';
import { pctDelta, checkArticleSeo, computeSeoScore } from './analyticsRepo';

describe('pctDelta (complete-period comparison)', () => {
  it('computes signed percent with 0.1 precision', () => {
    expect(pctDelta(110, 100)).toBe(10);
    expect(pctDelta(90, 100)).toBe(-10);
    expect(pctDelta(1, 3)).toBe(-66.7);
  });
  it('guards prior=0 — null, never Infinity', () => {
    expect(pctDelta(5, 0)).toBeNull();
    expect(pctDelta(0, 0)).toBeNull();
  });
});

describe('checkArticleSeo', () => {
  const base = {
    id: 'a1',
    slug: 's',
    title: 'راهنمای کامل خرید میلگرد A3',
    type: 'blog' as const,
    excerpt: null as string | null,
    bodyMd: '',
  };
  it('title band 20–65 chars', () => {
    expect(checkArticleSeo({ ...base, title: 'کوتاه' }).titleOk).toBe(false);
    expect(checkArticleSeo(base).titleOk).toBe(true);
    expect(checkArticleSeo({ ...base, title: 'ب'.repeat(70) }).titleOk).toBe(false);
  });
  it('excerpt (meta description) band 70–160', () => {
    expect(checkArticleSeo(base).excerptOk).toBe(false); // null
    expect(checkArticleSeo({ ...base, excerpt: 'م'.repeat(100) }).excerptOk).toBe(true);
    expect(checkArticleSeo({ ...base, excerpt: 'م'.repeat(200) }).excerptOk).toBe(false);
  });
  it('thin content < 300 words (plain text, no markdown to strip)', () => {
    expect(checkArticleSeo({ ...base, bodyMd: 'کلمه '.repeat(299) }).thinOk).toBe(false);
    const ok = checkArticleSeo({ ...base, bodyMd: 'کلمه '.repeat(300) });
    expect(ok.thinOk).toBe(true);
    expect(ok.words).toBe(300);
  });
  it('carries the article type through — needed to link to /blog/{slug} vs /news/{slug}, not a dead /guides/{slug}', () => {
    expect(checkArticleSeo({ ...base, type: 'news' }).type).toBe('news');
    expect(checkArticleSeo(base).type).toBe('blog');
  });
  it('does not count markdown syntax as words — a heading/bold/link/image/table stripped down to 4 real words must not pass as 300+', () => {
    const md = [
      '## عنوان زیربخش',
      '',
      'این **متن پررنگ** و این [یک پیوند](https://ahantime.com/prices/rebar/long-path) است.',
      '',
      '![نمودار قیمت](https://ahantime.com/uploads/chart.png)',
      '',
      '| سایز | وزن | قیمت |',
      '| --- | --- | --- |',
      '| ۱۴ | ۱٫۲۱ | ۱۰۰۰۰ |',
    ].join('\n');
    const { words } = checkArticleSeo({ ...base, bodyMd: md });
    // Reader-visible text is roughly: «عنوان زیربخش این متن پررنگ و این یک
    // پیوند است. سایز وزن قیمت ۱۴ ۱٫۲۱ ۱۰۰۰۰» — nowhere near 300, and the
    // naive (unstripped) split would additionally count the long URL and
    // every bare `|`/`---` table token as extra "words".
    expect(words).toBeLessThan(20);
  });
});

describe('computeSeoScore (weights: meta 30 / depth 25 / cadence 25 / freshness 20)', () => {
  it('perfect content scores 100', () => {
    expect(
      computeSeoScore({ titlePassRate: 1, excerptPassRate: 1, thinPassRate: 1, publishedLast30: 4, daysSinceLastPublish: 7 }),
    ).toBe(100);
  });
  it('never published → freshness 0, cadence 0', () => {
    expect(
      computeSeoScore({ titlePassRate: 1, excerptPassRate: 1, thinPassRate: 1, publishedLast30: 0, daysSinceLastPublish: null }),
    ).toBe(55); // 30 + 25 only
  });
  it('cadence caps at 4 posts / 30d (5 posts is not extra credit)', () => {
    const four = computeSeoScore({ titlePassRate: 0, excerptPassRate: 0, thinPassRate: 0, publishedLast30: 4, daysSinceLastPublish: 0 });
    const five = computeSeoScore({ titlePassRate: 0, excerptPassRate: 0, thinPassRate: 0, publishedLast30: 5, daysSinceLastPublish: 0 });
    expect(four).toBe(five);
  });
  it('freshness decays linearly: 14d full → 60d zero', () => {
    const at14 = computeSeoScore({ titlePassRate: 0, excerptPassRate: 0, thinPassRate: 0, publishedLast30: 0, daysSinceLastPublish: 14 });
    const at60 = computeSeoScore({ titlePassRate: 0, excerptPassRate: 0, thinPassRate: 0, publishedLast30: 0, daysSinceLastPublish: 60 });
    expect(at14).toBe(20);
    expect(at60).toBe(0);
  });
});

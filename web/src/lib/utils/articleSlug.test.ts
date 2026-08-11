import { describe, it, expect } from 'vitest';
import { articleSlugify, ARTICLE_SLUG_PATTERN, decodeArticleSlugParam } from './articleSlug';
import { articleSlugSchema } from '@/lib/validation/utils';

describe('articleSlugify', () => {
  it('turns a Persian title into a readable, hyphenated Persian slug', () => {
    // The whole point: not Finglish. A real title stays a real, readable URL.
    expect(articleSlugify('راهنمای انتخاب گرید میلگرد')).toBe('راهنمای-انتخاب-گرید-میلگرد');
  });

  it('converts ZWNJ (نیم‌فاصله) to a hyphen — normalizePersian alone leaves it untouched', () => {
    expect(articleSlugify('چگونه می‌شود قیمت را فهمید')).toBe('چگونه-می-شود-قیمت-را-فهمید');
  });

  it('folds Arabic homoglyphs before slugifying, so two spellings collide on purpose', () => {
    expect(articleSlugify('كيفيت ميلگرد')).toBe(articleSlugify('کیفیت میلگرد'));
  });

  it('keeps Latin/ASCII input working (mixed Persian+Latin titles happen)', () => {
    expect(articleSlugify('قیمت IPE 140 امروز')).toBe('قیمت-ipe-140-امروز');
  });

  it('never lets a dot through — the traversal-collapse vector slugSchema guards against', () => {
    expect(articleSlugify('..')).toBe('');
    expect(articleSlugify('راهنما../آجدار')).toBe('راهنماآجدار');
  });

  it('drops characters outside the allowlist instead of mis-encoding them', () => {
    expect(articleSlugify('قیمت؟ میلگرد!! (۱۴)')).toBe('قیمت-میلگرد-۱۴');
  });

  it('collapses repeated separators and trims leading/trailing hyphens', () => {
    expect(articleSlugify('  -- قیمت   میلگرد -- ')).toBe('قیمت-میلگرد');
  });

  it('lowercases Latin letters', () => {
    expect(articleSlugify('Rebar قیمت')).toBe('rebar-قیمت');
  });
});

describe('ARTICLE_SLUG_PATTERN', () => {
  it('matches what articleSlugify actually produces (schema and generator must never diverge)', () => {
    const slug = articleSlugify('راهنمای وزن میلگرد ۱۴');
    expect(ARTICLE_SLUG_PATTERN.test(slug)).toBe(true);
  });
});

describe('articleSlugSchema', () => {
  const s = articleSlugSchema(120);

  it('accepts a Persian slug', () => {
    expect(s.safeParse('راهنمای-وزن-میلگرد').success).toBe(true);
  });

  it('still accepts a plain ASCII slug — catalog-style slugs must keep working here too', () => {
    expect(s.safeParse('rebar-buying-guide').success).toBe(true);
  });

  it('accepts a mixed Persian/Latin slug', () => {
    expect(s.safeParse('قیمت-ipe-140-امروز').success).toBe(true);
  });

  it('rejects the traversal segment', () => {
    expect(s.safeParse('..').success).toBe(false);
    expect(s.safeParse('a/../b').success).toBe(false);
  });

  it('rejects spaces, uppercase and edge hyphens', () => {
    expect(s.safeParse('راهنمای وزن').success).toBe(false);
    expect(s.safeParse('Rebar-Guide').success).toBe(false);
    expect(s.safeParse('-رهنما').success).toBe(false);
    expect(s.safeParse('رهنما-').success).toBe(false);
  });

  it('rejects a raw ZWNJ or RTL-override character sneaking straight into the field', () => {
    expect(s.safeParse('می‌شود').success).toBe(false); // raw ZWNJ, not folded
    expect(s.safeParse('راهنما‮آجدار').success).toBe(false); // RTL override
  });
});


describe('decodeArticleSlugParam', () => {
  it('decodes a percent-encoded Persian slug back to real Persian text', () => {
    const slug = articleSlugify('میلگرد چیست؟');
    expect(decodeArticleSlugParam(encodeURIComponent(slug))).toBe(slug);
  });

  it('is a no-op on an already-decoded ASCII slug (the common case)', () => {
    expect(decodeArticleSlugParam('rebar-price-forecast-tir')).toBe('rebar-price-forecast-tir');
  });

  it('is a no-op on an already-decoded Persian slug — decoding must not double-decode', () => {
    const slug = articleSlugify('راهنمای وزن میلگرد');
    expect(decodeArticleSlugParam(slug)).toBe(slug);
  });

  it('returns the input as-is on a malformed escape instead of throwing', () => {
    expect(decodeArticleSlugParam('%E0%A4%A')).toBe('%E0%A4%A');
  });
});

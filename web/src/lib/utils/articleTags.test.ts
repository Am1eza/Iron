import { describe, it, expect } from 'vitest';
import { normalizeArticleTag, normalizeArticleTags, MAX_ARTICLE_TAGS } from './articleTags';

describe('normalizeArticleTag', () => {
  it('folds Arabic ي/ك to Persian ی/ک — the split that makes half the archive invisible', () => {
    expect(normalizeArticleTag('ميلگرد')).toBe('میلگرد');
    expect(normalizeArticleTag('كيفيت')).toBe('کیفیت');
    expect(normalizeArticleTag('ميلگرد')).toBe(normalizeArticleTag('میلگرد'));
  });

  it('folds ZWNJ (نیم‌فاصله) to a plain space, matching how articleSlugify treats it', () => {
    expect(normalizeArticleTag('آهن‌آلات')).toBe('آهن آلات');
    expect(normalizeArticleTag('آهن‌آلات')).toBe(normalizeArticleTag('آهن آلات'));
  });

  it('drops zero-width and bidi-control paste artefacts entirely', () => {
    expect(normalizeArticleTag('​میلگرد‏')).toBe('میلگرد');
    expect(normalizeArticleTag('﻿میلگرد‮')).toBe('میلگرد');
  });

  it('trims and collapses whitespace', () => {
    expect(normalizeArticleTag('  میلگرد   آجدار  ')).toBe('میلگرد آجدار');
  });

  it('folds Arabic-Indic digits to Persian, as the size/factory columns already do', () => {
    expect(normalizeArticleTag('ميلگرد ٤٥')).toBe('میلگرد ۴۵');
  });

  it('returns empty for whitespace-only or invisible-only input', () => {
    expect(normalizeArticleTag('   ')).toBe('');
    expect(normalizeArticleTag('‌​')).toBe('');
  });
});

describe('normalizeArticleTags', () => {
  it('drops empties left behind after trimming', () => {
    expect(normalizeArticleTags(['میلگرد', '   ', '', 'تیرآهن'])).toEqual(['میلگرد', 'تیرآهن']);
  });

  it('de-duplicates ی/ك variants down to one tag, keeping the first spelling typed', () => {
    expect(normalizeArticleTags(['ميلگرد', 'میلگرد'])).toEqual(['میلگرد']);
    expect(normalizeArticleTags(['آهن‌آلات', 'آهن آلات', 'آهن‌آلات'])).toEqual(['آهن آلات']);
  });

  it('de-duplicates case-insensitively for Latin tags', () => {
    expect(normalizeArticleTags(['Rebar', 'rebar', 'REBAR'])).toEqual(['Rebar']);
  });

  it('caps the list at MAX_ARTICLE_TAGS', () => {
    const many = Array.from({ length: 20 }, (_, i) => `tag${i}`);
    const out = normalizeArticleTags(many);
    expect(out).toHaveLength(MAX_ARTICLE_TAGS);
    expect(out[0]).toBe('tag0');
    expect(out.at(-1)).toBe(`tag${MAX_ARTICLE_TAGS - 1}`);
  });

  it('counts the cap AFTER de-duplication, so duplicates never cost a slot', () => {
    const withDupes = ['میلگرد', 'ميلگرد', ...Array.from({ length: 11 }, (_, i) => `tag${i}`)];
    expect(normalizeArticleTags(withDupes)).toHaveLength(MAX_ARTICLE_TAGS);
  });

  it('returns an empty array for an empty list — `[]` is the untagged value', () => {
    expect(normalizeArticleTags([])).toEqual([]);
  });
});

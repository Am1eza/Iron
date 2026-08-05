/**
 * Keyword-research deep links (US-14.4). The only things worth asserting are
 * the two ways a Persian phrase gets mangled on the way into a URL: a space
 * encoded as `+` in a PATH (wrong — that is query-string encoding), and a
 * phrase left raw so the link 404s or drops half the words.
 */
import { describe, it, expect } from 'vitest';
import { googleTrendsUrl, keywordToolLinks, keywordchiUrl } from './keywordTools';

describe('keywordchiUrl', () => {
  it('percent-encodes the phrase as a path segment', () => {
    const url = keywordchiUrl('قیمت میلگرد')!;
    expect(url).toBe(`https://keywordchi.com/${encodeURIComponent('قیمت میلگرد')}`);
    // A space in a PATH is %20, never '+'.
    expect(url).toContain('%20');
    expect(url).not.toContain('+');
  });

  it('is null for an empty or whitespace-only keyword', () => {
    expect(keywordchiUrl('')).toBeNull();
    expect(keywordchiUrl('   ')).toBeNull();
  });
});

describe('googleTrendsUrl', () => {
  it('scopes the explore link to Iran, in Persian', () => {
    const url = new URL(googleTrendsUrl('ورق گالوانیزه')!);
    expect(url.origin + url.pathname).toBe('https://trends.google.com/trends/explore');
    expect(url.searchParams.get('q')).toBe('ورق گالوانیزه');
    expect(url.searchParams.get('geo')).toBe('IR');
    expect(url.searchParams.get('hl')).toBe('fa');
  });

  it('is null for an empty keyword', () => {
    expect(googleTrendsUrl('  ')).toBeNull();
  });
});

describe('keywordToolLinks', () => {
  it('returns nothing at all until there is a keyword', () => {
    expect(keywordToolLinks('')).toEqual([]);
  });

  it('returns both tools, each with a hint that describes what the click does', () => {
    const links = keywordToolLinks('میلگرد');
    expect(links.map((l) => l.id)).toEqual(['keywordchi', 'trends']);
    for (const link of links) {
      expect(link.hint.trim().length).toBeGreaterThan(0);
      expect(link.url.startsWith('https://')).toBe(true);
    }
  });
});

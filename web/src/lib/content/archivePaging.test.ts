import { describe, it, expect } from 'vitest';
import { MAX_PAGE, archiveHref, archiveRedirect, parsePageParam } from './archivePaging';

describe('archiveHref', () => {
  it('gives page 1 exactly one URL', () => {
    expect(archiveHref('blog', 1)).toBe('/blog');
    expect(archiveHref('news', 1)).toBe('/news');
    expect(archiveHref('blog', 0)).toBe('/blog');
  });

  it('puts later pages in the path, not a query string', () => {
    expect(archiveHref('blog', 2)).toBe('/blog/page/2');
    expect(archiveHref('news', 37)).toBe('/news/page/37');
  });
});

describe('parsePageParam', () => {
  it('accepts a plain decimal page from 2 up to the bound', () => {
    expect(parsePageParam('2')).toBe(2);
    expect(parsePageParam('12')).toBe(12);
    expect(parsePageParam(String(MAX_PAGE))).toBe(MAX_PAGE);
  });

  it('rejects page 1 — it is /blog, not /blog/page/1', () => {
    expect(parsePageParam('1')).toBeNull();
  });

  it('rejects anything that would mint an unbounded cache-key space', () => {
    for (const bad of [
      '0',
      '-2',
      '2.5',
      '1e30',
      'abc',
      '',
      ' 2',
      '02',
      '٢', // Persian digit
      '99999',
      String(MAX_PAGE + 1),
      '2/../x',
      '٢٣',
    ]) {
      expect(parsePageParam(bad)).toBeNull();
    }
  });
});

describe('archiveRedirect', () => {
  it('moves the old query form onto the path', () => {
    expect(archiveRedirect('/blog', '2')).toBe('/blog/page/2');
    expect(archiveRedirect('/news', '3')).toBe('/news/page/3');
  });

  it('collapses page 1 and junk to the bare index (where they used to land)', () => {
    expect(archiveRedirect('/blog', '1')).toBe('/blog');
    expect(archiveRedirect('/blog', 'abc')).toBe('/blog');
    expect(archiveRedirect('/blog', '999999')).toBe('/blog');
    expect(archiveRedirect('/news', '0')).toBe('/news');
  });

  it('collapses /blog/page/1 onto the one URL page 1 has', () => {
    expect(archiveRedirect('/blog/page/1', null)).toBe('/blog');
    expect(archiveRedirect('/news/page/1', null)).toBe('/news');
  });

  it('ignores everything else — out-of-range pages are the 404 guard\'s job', () => {
    expect(archiveRedirect('/blog', null)).toBeNull();
    expect(archiveRedirect('/news', null)).toBeNull();
    expect(archiveRedirect('/prices', '2')).toBeNull();
    expect(archiveRedirect('/blog/steel-weight-guide', '2')).toBeNull();
    expect(archiveRedirect('/blog/page/2', null)).toBeNull();
    expect(archiveRedirect('/blog/page/999', null)).toBeNull();
    expect(archiveRedirect('/blog/page/abc', null)).toBeNull();
  });

  // The redirect must never point at a URL the target route would bounce
  // back — that is a loop. Every value it can emit either IS the bare index
  // or parses cleanly as a page param.
  it('never emits a value the archive route would reject', () => {
    for (const raw of ['1', '2', '5000', '5001', 'abc', '0', '-1', '99999']) {
      const to = archiveRedirect('/blog', raw);
      if (to === null || to === '/blog') continue;
      const n = to.slice('/blog/page/'.length);
      expect(parsePageParam(n)).not.toBeNull();
    }
  });
});

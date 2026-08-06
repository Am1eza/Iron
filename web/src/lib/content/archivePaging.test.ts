import { describe, it, expect } from 'vitest';
import {
  MAX_PAGE,
  archiveHref,
  archiveIndexFallback,
  archiveRedirect,
  parsePageParam,
} from './archivePaging';

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
  it('moves the old query form onto the path, permanently', () => {
    expect(archiveRedirect('/blog', '2')).toEqual({ pathname: '/blog/page/2', permanent: true });
    expect(archiveRedirect('/news', '3')).toEqual({ pathname: '/news/page/3', permanent: true });
    expect(archiveRedirect('/blog', '1')).toEqual({ pathname: '/blog', permanent: true });
  });

  it('sends a junk value to the index TEMPORARILY', () => {
    // A 308 is cached by the browser for that exact URL forever; minting
    // permanent redirects keyed on unbounded attacker-supplied input is cache
    // pollution for no benefit.
    for (const junk of ['abc', '0', '-1', '999999', '2.5', '']) {
      expect(archiveRedirect('/blog', junk)).toEqual({ pathname: '/blog', permanent: false });
    }
  });

  it('collapses /blog/page/1 onto the one URL page 1 has', () => {
    expect(archiveRedirect('/blog/page/1', null)).toEqual({ pathname: '/blog', permanent: true });
    expect(archiveRedirect('/news/page/1', null)).toEqual({ pathname: '/news', permanent: true });
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

  // The redirect must never point at a URL the target route or the 404 guard
  // would bounce back — that is a loop.
  it('never emits a value the archive route would reject', () => {
    for (const raw of ['1', '2', '5000', '5001', 'abc', '0', '-1', '99999']) {
      const to = archiveRedirect('/blog', raw);
      if (to === null || to.pathname === '/blog') continue;
      expect(parsePageParam(to.pathname.slice('/blog/page/'.length))).not.toBeNull();
    }
  });
});

describe('archiveIndexFallback', () => {
  it('sends an unknown archive page back to its section, not to a 404', () => {
    expect(archiveIndexFallback('/blog/page/7')).toBe('/blog');
    expect(archiveIndexFallback('/news/page/999')).toBe('/news');
    expect(archiveIndexFallback('/blog/page/abc')).toBe('/blog');
  });

  it('does not touch article slugs or anything else', () => {
    // An invented article slug IS a fabricated URL and must stay a hard 404.
    expect(archiveIndexFallback('/blog/does-not-exist')).toBeNull();
    expect(archiveIndexFallback('/blog')).toBeNull();
    expect(archiveIndexFallback('/blog/rss.xml')).toBeNull();
    expect(archiveIndexFallback('/prices/rebar')).toBeNull();
  });

  // The fallback target must not itself be something the guard would 404 or
  // the redirect helper would bounce — otherwise the hop chain does not settle.
  it('lands on a URL nothing else redirects or 404s', () => {
    for (const p of ['/blog/page/7', '/news/page/2']) {
      const to = archiveIndexFallback(p)!;
      expect(archiveRedirect(to, null)).toBeNull();
    }
  });
});

import { describe, it, expect } from 'vitest';
import { hasGuardedPrefix, isGuardedPath, normalizeKnownPath, shouldNotFound } from './knownPaths';

const known = new Set([
  '/prices/rebar',
  '/prices/rebar/deformed',
  '/prices/rebar/deformed/rebar-14-a3-zob',
  '/prices/pipe',
  '/prices/pipe/gas',
  '/blog/what-is-a3',
  '/news/market-update',
]);

describe('shouldNotFound', () => {
  it('leaves every real catalog URL alone', () => {
    for (const p of known) expect(shouldNotFound(p, known)).toBe(false);
  });

  it('404s an unknown slug at every catalog depth', () => {
    expect(shouldNotFound('/prices/no-such-cat', known)).toBe(true);
    expect(shouldNotFound('/prices/rebar/no-such-sub', known)).toBe(true);
    expect(shouldNotFound('/prices/rebar/deformed/no-such-sku', known)).toBe(true);
  });

  it('404s a real SKU requested under the wrong category/sub', () => {
    // The [sku] page's duplicate-content guard: a SKU resolves only under its
    // own canonical path. The set is keyed on that path, so this falls out.
    expect(shouldNotFound('/prices/pipe/gas/rebar-14-a3-zob', known)).toBe(true);
  });

  it('404s an unknown article but not the index pages', () => {
    expect(shouldNotFound('/blog/nope', known)).toBe(true);
    expect(shouldNotFound('/news/nope', known)).toBe(true);
    expect(shouldNotFound('/blog', known)).toBe(false);
    expect(shouldNotFound('/news', known)).toBe(false);
    expect(shouldNotFound('/prices', known)).toBe(false);
  });

  it('never touches a path outside the guarded families', () => {
    for (const p of ['/', '/about', '/ai', '/api/catalog/rows', '/admin/pricing', '/account/orders']) {
      expect(shouldNotFound(p, known)).toBe(false);
    }
  });

  it('FAILS OPEN on an unloaded set — a DB outage must not kill the catalog', () => {
    expect(shouldNotFound('/prices/no-such-cat', new Set())).toBe(false);
    expect(shouldNotFound('/prices/rebar/deformed/no-such-sku', new Set())).toBe(false);
  });

  it('ignores a trailing slash rather than 404ing on it', () => {
    expect(shouldNotFound('/prices/rebar/deformed/', known)).toBe(false);
  });

  it('judges a percent-encoded path by what it decodes to', () => {
    expect(shouldNotFound('/prices/rebar/%64eformed', known)).toBe(false);
    expect(shouldNotFound('/prices/rebar/%64eform-nope', known)).toBe(true);
  });

  it('does not throw on a malformed escape sequence', () => {
    expect(() => shouldNotFound('/prices/rebar/%zz', known)).not.toThrow();
    expect(shouldNotFound('/prices/rebar/%zz', known)).toBe(true);
  });

  it('leaves a path deeper than any catalog route to Next’s own router', () => {
    expect(shouldNotFound('/prices/a/b/c/d', known)).toBe(false);
    expect(isGuardedPath('/prices/a/b/c/d')).toBe(false);
  });
});

describe('hasGuardedPrefix', () => {
  it('is the cheap gate that keeps non-catalog traffic off the catalog query', () => {
    expect(hasGuardedPrefix('/prices/rebar')).toBe(true);
    expect(hasGuardedPrefix('/blog/x')).toBe(true);
    expect(hasGuardedPrefix('/news/x')).toBe(true);
    expect(hasGuardedPrefix('/')).toBe(false);
    expect(hasGuardedPrefix('/prices')).toBe(false);
    expect(hasGuardedPrefix('/api/ai/chat')).toBe(false);
  });
});

describe('normalizeKnownPath', () => {
  it('keeps the root as-is', () => {
    expect(normalizeKnownPath('/')).toBe('/');
  });
  it('strips trailing slashes', () => {
    expect(normalizeKnownPath('/prices/rebar//')).toBe('/prices/rebar');
  });
});

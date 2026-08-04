// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { jsonWithEtag, weakEtagOf } from './httpCache';

const req = (ifNoneMatch?: string) =>
  new Request('https://ahantime.com/api/categories/rebar', {
    headers: ifNoneMatch ? { 'if-none-match': ifNoneMatch } : {},
  });

describe('weakEtagOf', () => {
  it('is stable for identical payloads', () => {
    expect(weakEtagOf('{"a":1}')).toBe(weakEtagOf('{"a":1}'));
  });

  it('changes when the payload changes — including a one-digit price edit', () => {
    const before = weakEtagOf(JSON.stringify({ rows: [{ slug: 'rebar-14', price: 42_000 }] }));
    const after = weakEtagOf(JSON.stringify({ rows: [{ slug: 'rebar-14', price: 42_001 }] }));
    expect(after).not.toBe(before);
  });

  it('is a fixed-width hex token', () => {
    expect(weakEtagOf('')).toMatch(/^[0-9a-f]{16}$/);
    expect(weakEtagOf('x'.repeat(10_000))).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('jsonWithEtag', () => {
  it('no longer advertises stale-while-revalidate', async () => {
    // THE FIX. `s-maxage=120, stale-while-revalidate=300` licensed any shared
    // cache to serve a known-possibly-wrong price for 420s total, with no way
    // for an admin price save to cut it short. Worst case is now the 120s
    // s-maxage — no longer longer than the ISR pages' own window.
    const res = jsonWithEtag(req(), { rows: [] }, 120);
    const cc = res.headers.get('cache-control')!;
    expect(cc).toBe('public, s-maxage=120');
    expect(cc).not.toContain('stale-while-revalidate');
  });

  it('serves the body with a weak ETag on a fresh request', async () => {
    const res = jsonWithEtag(req(), { rows: [1, 2] }, 120);
    expect(res.status).toBe(200);
    expect(res.headers.get('etag')).toMatch(/^W\/"[0-9a-f]{16}"$/);
    expect(await res.json()).toEqual({ rows: [1, 2] });
  });

  it('answers 304 with no body when the client already has this representation', async () => {
    const first = jsonWithEtag(req(), { rows: [1, 2] }, 120);
    const tag = first.headers.get('etag')!;
    const second = jsonWithEtag(req(tag), { rows: [1, 2] }, 120);
    expect(second.status).toBe(304);
    expect(await second.text()).toBe('');
    // The validator must ride along on the 304 too, or the cache cannot
    // refresh its own stored tag.
    expect(second.headers.get('etag')).toBe(tag);
  });

  it('answers 200 once the price actually changed, even with the old validator', async () => {
    const stale = jsonWithEtag(req(), { rows: [{ price: 42_000 }] }, 120).headers.get('etag')!;
    const res = jsonWithEtag(req(stale), { rows: [{ price: 43_500 }] }, 120);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ rows: [{ price: 43_500 }] });
  });

  it('accepts a strong-form tag and a comma list, per RFC 9110', async () => {
    const tag = jsonWithEtag(req(), { rows: [] }, 120).headers.get('etag')!;
    const strong = tag.replace(/^W\//, '');
    expect(jsonWithEtag(req(strong), { rows: [] }, 120).status).toBe(304);
    expect(jsonWithEtag(req(`"deadbeef", ${strong}`), { rows: [] }, 120).status).toBe(304);
    expect(jsonWithEtag(req('*'), { rows: [] }, 120).status).toBe(304);
  });

  it('does not 304 on a non-matching tag', async () => {
    expect(jsonWithEtag(req('"0000000000000000"'), { rows: [] }, 120).status).toBe(200);
  });
});

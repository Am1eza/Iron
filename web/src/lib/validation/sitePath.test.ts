/**
 * `sitePathSchema` — the validator standing between an admin-supplied string
 * and (a) a cache key and (b) the `page` filter of an outbound request to
 * Google (US-14.4).
 *
 * Every rejection case below is one a prohibition-list version of this check
 * ACCEPTED. The backslash pair is the important one: the WHATWG URL parser
 * treats `\` as `/` for special schemes, so `/\evil.com` passes "starts with
 * /, no //, no ://" and then resolves straight off the origin.
 */
import { describe, it, expect } from 'vitest';
import { sitePathSchema } from './utils';

const schema = sitePathSchema('https://ahantime.com');
const accepts = (v: string) => schema.safeParse(v).success;

describe('sitePathSchema', () => {
  it('accepts ordinary site paths', () => {
    expect(accepts('/')).toBe(true);
    expect(accepts('/blog/steel-guide')).toBe(true);
    expect(accepts('/news/x-1')).toBe(true);
  });

  it('accepts an already percent-encoded Persian slug', () => {
    // This is exactly what `routes.blog()` produces, and exactly how Search
    // Console reports the page — both sides must agree byte for byte.
    expect(accepts(`/blog/${encodeURIComponent('راهنمای-میلگرد')}`)).toBe(true);
  });

  it('rejects a backslash that the URL parser would treat as a slash', () => {
    expect(accepts('/\\evil.com')).toBe(false);
    expect(accepts('/\\\\evil.com')).toBe(false);
    // Proof of what it would have resolved to, so the reason survives a
    // future "why is this check so strict?".
    expect(new URL('/\\evil.com', 'https://ahantime.com').origin).toBe('https://evil.com');
  });

  it('rejects protocol-relative and absolute URLs', () => {
    expect(accepts('//evil.com')).toBe(false);
    expect(accepts('https://evil.com/x')).toBe(false);
    expect(accepts('https:/x')).toBe(false);
  });

  it('rejects anything that is not a bare path', () => {
    expect(accepts('blog/x')).toBe(false); // no leading slash
    expect(accepts('/blog/x?utm=1')).toBe(false); // one page, one cache key
    expect(accepts('/blog/x#top')).toBe(false);
    expect(accepts('/blog/ x')).toBe(false);
    expect(accepts('/blog/\tx')).toBe(false);
    expect(accepts('')).toBe(false);
  });

  it('rejects a path that does not round-trip, so one page cannot become two keys', () => {
    // Resolves to `/blog/x` — two spellings of one page would otherwise be
    // two cache rows.
    expect(accepts('/a/../blog/x')).toBe(false);
    expect(accepts('/blog/x/./y')).toBe(false);
    // An INTERNAL double slash does round-trip (the parser preserves it) and
    // is genuinely a different path, so it is allowed. Only a LEADING `//`
    // changes the origin, and that is rejected above.
    expect(accepts('/blog//x')).toBe(true);
  });

  it('enforces the length cap', () => {
    expect(accepts(`/${'a'.repeat(400)}`)).toBe(false);
  });
});

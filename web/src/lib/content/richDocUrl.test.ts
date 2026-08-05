/**
 * Adversarial regression suite for the three URL classifiers in `richDoc.ts`.
 *
 * Every ALLOW/BLOCK expectation below was first checked against what the
 * WHATWG URL parser — i.e. the browser — actually does with the string, using
 * `https://ahantime.com` as the resolution base. The bugs these lock down all
 * had the same shape: a string that *looks* site-relative to a regex but
 * resolves to a third-party origin.
 */
import { describe, it, expect } from 'vitest';
import { safeHref, isExternal, normalizeImageSrc, richDocSchema } from './richDoc';

const SITE = 'https://ahantime.com';

/** What a browser would navigate to for this href on an article page. */
function resolves(href: string): string {
  return new URL(href, `${SITE}/blog/x`).toString();
}

describe('safeHref — script-capable schemes stay blocked', () => {
  const blocked = [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    '  javascript:alert(1)',
    'java\tscript:alert(1)',
    'java\nscript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'DATA:text/html;base64,PHNjcmlwdD4=',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'blob:https://ahantime.com/abc',
    'about:blank',
  ];
  it.each(blocked)('blocks %j', (input) => {
    expect(safeHref(input)).toBeNull();
  });
});

describe('safeHref — the off-site-in-a-site-relative-costume family', () => {
  // Each of these starts with a single `/` (so `/^\//` said "internal") and
  // resolves to a third-party origin. That is the whole bug: the link was
  // rendered with `rel="noopener"` only — no nofollow, no noreferrer — while
  // navigating off-site and passing link equity to the attacker's domain.
  const bypasses = ['//evil.com', '/\\evil.com', '/\\/evil.com', '/\t/evil.com', '/\r\n/evil.com'];

  it.each(bypasses)('%j really does resolve off-origin', (input) => {
    expect(new URL(input, SITE).origin).not.toBe(SITE);
  });

  it.each(bypasses)('blocks %j', (input) => {
    expect(safeHref(input)).toBeNull();
  });
});

describe('safeHref — legitimate values still pass, unchanged', () => {
  const allowed = [
    '/prices/rebar',
    '/blog',
    '/blog/steel-weight-guide',
    '/prices/rebar?size=14#tbl',
    '/blog/راهنمای-وزن',
    '/blog/%D8%B1%D8%A7%D9%87%D9%86%D9%85%D8%A7',
    '#section-2',
    'mailto:info@ahantime.com',
    'MAILTO:info@ahantime.com',
    'tel:+982126297512',
    'https://ahantime.com/prices/rebar',
    'https://example.com/a/b',
    'http://example.com/',
  ];
  it.each(allowed)('allows %j and returns it verbatim', (input) => {
    expect(safeHref(input)).toBe(input.trim());
  });

  it('rejects a bare relative reference (unchanged from before)', () => {
    expect(safeHref('prices/rebar')).toBeNull();
    expect(safeHref('')).toBeNull();
    expect(safeHref('   ')).toBeNull();
  });
});

describe('isExternal', () => {
  it('is false for our own pages, however they are written', () => {
    expect(isExternal('/prices/rebar')).toBe(false);
    expect(isExternal('https://ahantime.com/prices/rebar')).toBe(false);
    expect(isExternal('#anchor')).toBe(false);
    expect(isExternal('mailto:info@ahantime.com')).toBe(false);
    expect(isExternal('tel:+982126297512')).toBe(false);
  });

  it('is true for a genuinely different origin', () => {
    expect(isExternal('https://example.com/x')).toBe(true);
    expect(isExternal('http://ahantime.com.evil.example/x')).toBe(true);
  });

  it('catches the userinfo form a prefix regex reads as our domain', () => {
    // `new URL('https://ahantime.com@evil.example/').origin === 'https://evil.example'`
    expect(new URL('https://ahantime.com@evil.example/').origin).toBe('https://evil.example');
    expect(isExternal('https://ahantime.com@evil.example/')).toBe(true);
    expect(isExternal('https://ahantime.com:pw@evil.example/')).toBe(true);
  });

  it('fails toward nofollow for parser-confusable input', () => {
    expect(isExternal('/\\evil.com')).toBe(true);
    expect(isExternal('/\t/evil.com')).toBe(true);
  });
});

describe('normalizeImageSrc', () => {
  it('keeps upload paths and folds an absolute upload URL to its path', () => {
    expect(normalizeImageSrc('/uploads/01H.png')).toBe('/uploads/01H.png');
    expect(normalizeImageSrc('https://ahantime.com/uploads/01H.png')).toBe('/uploads/01H.png');
    // The host an upload carries is whichever one the admin was on — folding
    // it away is the POINT of this helper, so it must keep happening.
    expect(normalizeImageSrc('https://panel.ahantime.com/uploads/01H.png')).toBe('/uploads/01H.png');
    expect(normalizeImageSrc('http://localhost:3000/uploads/01H.png')).toBe('/uploads/01H.png');
  });

  it('blocks the same site-relative-costume family', () => {
    for (const bad of ['//evil.com/x.png', '/\\evil.com/x.png', '/\\/evil.com/x.png', '/\t/evil.com/x.png']) {
      expect(normalizeImageSrc(bad)).toBeNull();
    }
  });

  it('blocks non-http(s) schemes', () => {
    expect(normalizeImageSrc('javascript:alert(1)')).toBeNull();
    expect(normalizeImageSrc('data:image/svg+xml,<svg onload=alert(1)>')).toBeNull();
    expect(normalizeImageSrc('')).toBeNull();
  });

  it('still keeps a remote https image (deliberate — see the docstring)', () => {
    expect(normalizeImageSrc('https://example.com/a.png')).toBe('https://example.com/a.png');
  });
});

describe('the write-side boundary rejects the same strings', () => {
  const doc = (href: string) => ({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'برو', marks: [{ type: 'link', attrs: { href } }] }],
      },
    ],
  });

  it.each(['//evil.com', '/\\evil.com', '/\\/evil.com', 'javascript:alert(1)'])(
    'refuses to store a link to %j',
    (href) => {
      expect(richDocSchema.safeParse(doc(href)).success).toBe(false);
    },
  );

  it('still stores an ordinary internal link', () => {
    expect(richDocSchema.safeParse(doc('/prices/rebar')).success).toBe(true);
  });

  it('resolves() sanity: the base used by the helpers matches the site', () => {
    expect(resolves('/prices/rebar')).toBe(`${SITE}/prices/rebar`);
  });
});

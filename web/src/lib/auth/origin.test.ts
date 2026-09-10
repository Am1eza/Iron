// @vitest-environment node
import { expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { assertSameOrigin } from './origin';
function check(headers: Record<string, string>, method = 'POST') {
  return assertSameOrigin(new NextRequest('https://example.test/api', { method, headers }));
}
it.each(['null', 'ftp://example.test', 'https://user@example.test', 'https://evil.test'])(
  'rejects untrusted Origin %s',
  (origin) => {
    expect(check({ host: 'example.test', origin })?.status).toBe(403);
  },
);
it('rejects cross-site browser metadata even with matching host', () => {
  expect(
    check({ host: 'example.test', origin: 'http://example.test', 'sec-fetch-site': 'cross-site' })
      ?.status,
  ).toBe(403);
});
it('accepts same-origin and Referer fallback', () => {
  expect(
    check({
      host: 'example.test',
      origin: 'https://example.test',
      'sec-fetch-site': 'same-origin',
    }),
  ).toBeNull();
  expect(check({ host: 'example.test', referer: 'https://example.test/account' })).toBeNull();
});
it('fails closed for missing Host or mutation Origin', () => {
  expect(check({ origin: 'https://example.test' })?.status).toBe(403);
  expect(check({ host: 'example.test' })?.status).toBe(403);
  expect(check({ host: 'example.test' }, 'GET')).toBeNull();
});
it('does not substitute Referer for an invalid Origin', () => {
  expect(
    check({ host: 'example.test', origin: 'null', referer: 'https://example.test' })?.status,
  ).toBe(403);
});

// G-168: a homograph domain (Cyrillic а U+0430 standing in for Latin a) is
// not a raw-unicode attack against THIS function at all — the WHATWG Headers
// API a real browser (and Next's own `Request`) is built on only accepts
// ByteString header values, so a raw non-ASCII `Origin` cannot be constructed
// as an HTTP header in the first place (proven directly below: even in a
// test, attempting it throws before `assertSameOrigin` ever runs). A browser
// sending an Origin for an IDN page therefore ALWAYS punycode-encodes it
// first — so the only realistic homograph vector is a punycode string that
// merely LOOKS unrelated to the real host, which is just an ordinary string
// inequality `assertSameOrigin` already rejects like any other wrong origin.
it('cannot even construct a raw non-ASCII Origin header — the platform itself forecloses that attack', () => {
  expect(() => check({ host: 'example.test', origin: 'https://exаmple.test' })).toThrow(); // Cyrillic а (U+0430)
});

it('rejects a punycode-encoded look-alike host (a different host, not an encoding of the real one)', () => {
  const punycodeLookAlike = 'https://xn--example-x1x.test'; // not the same as plain example.test
  expect(check({ host: 'example.test', origin: punycodeLookAlike })?.status).toBe(403);
});

// G-167: this app is legitimately reachable on TWO real hostnames
// (ahantime.com, panel.ahantime.com — same container, see panelHost.ts). The
// guard is self-referential (Origin's host must equal THIS request's own
// Host) rather than a hardcoded allowlist of the two — on purpose: it works
// for either host automatically with no list to keep in sync, and per-request
// self-comparison means it is impossible for a write against one host to be
// authorized by an Origin naming the OTHER, which is the actual risk a
// cross-subdomain CSRF would need. Proven directly for both real hosts below.
it.each(['ahantime.com', 'panel.ahantime.com'])('accepts a same-origin write on the real host %s', (host) => {
  expect(check({ host, origin: `https://${host}`, 'sec-fetch-site': 'same-origin' })).toBeNull();
});

it('rejects a write to one real host carrying the OTHER real host as its Origin — cross-subdomain CSRF', () => {
  expect(check({ host: 'ahantime.com', origin: 'https://panel.ahantime.com' })?.status).toBe(403);
  expect(check({ host: 'panel.ahantime.com', origin: 'https://ahantime.com' })?.status).toBe(403);
});

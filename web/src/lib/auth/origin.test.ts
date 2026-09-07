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

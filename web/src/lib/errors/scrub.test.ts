import { describe, it, expect } from 'vitest';
import { scrubMobile, scrubPii } from './scrub';
import { randomToken } from '@/lib/auth/crypto';

describe('scrubMobile', () => {
  it('redacts an Iranian mobile written as 09xxxxxxxxx', () => {
    expect(scrubMobile('تماس با 09123456789 گرفته شد')).toBe('تماس با [redacted-mobile] گرفته شد');
  });

  it('redacts +98 and bare 98 prefixes', () => {
    expect(scrubMobile('+989123456789')).toBe('[redacted-mobile]');
    expect(scrubMobile('989123456789')).toBe('[redacted-mobile]');
  });

  it('leaves a 10-digit Toman price untouched', () => {
    expect(scrubMobile('total 1234567890 toman')).toBe('total 1234567890 toman');
  });
});

describe('scrubPii', () => {
  it('redacts an email embedded in an error message', () => {
    expect(scrubPii('failed to notify user@example.com')).toBe('failed to notify [redacted-email]');
  });

  it('redacts both a mobile and an email in the same string', () => {
    expect(scrubPii('09123456789 / sales@ahantime.com')).toBe('[redacted-mobile] / [redacted-email]');
  });

  it('leaves an order ref and a price untouched', () => {
    expect(scrubPii('PF-10023 total 1234567890')).toBe('PF-10023 total 1234567890');
  });

  it('is a no-op on non-string values', () => {
    expect(scrubPii(42)).toBe(42);
    expect(scrubPii(undefined)).toBe(undefined);
    expect(scrubPii(null)).toBe(null);
  });
  // The email pattern used to match `package@1.2.3`, so every stack frame
  // under node_modules/.pnpm/ became [redacted-email] — destroying the one
  // thing a stack trace is for.
  it('leaves a pnpm store path in a stack trace intact', () => {
    const frame = 'at Object.<anonymous> (/app/node_modules/.pnpm/@electric-sql+pglite@0.5.3/node_modules/x.js:1:1)';
    expect(scrubPii(frame)).toBe(frame);
  });

  it('still redacts a real address next to a version string', () => {
    expect(scrubPii('next@15.5.22 failed, mail ops@ahantime.com')).toBe(
      'next@15.5.22 failed, mail [redacted-email]',
    );
  });

  // F-144: a real refresh token (auth/crypto.ts#randomToken — always 64
  // lowercase hex chars) embedded bare in a freeform error message or URL path
  // (not a `Bearer …` header, not a `?token=` query param — those were already
  // covered) must never reach a log line or Sentry event unredacted.
  it('redacts a bare refresh-token-shaped hex string in an arbitrary message', () => {
    const token = randomToken(32);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(scrubPii(`rotateRefresh failed for token ${token} — parent not found`)).toBe(
      'rotateRefresh failed for token [redacted-token] — parent not found',
    );
  });

  it('redacts the same shape appearing bare in a URL path (not just a query param)', () => {
    const token = randomToken(32);
    expect(scrubPii(`GET /internal/sessions/${token} -> 500`)).toBe(
      'GET /internal/sessions/[redacted-token] -> 500',
    );
  });

  it('does not touch a shorter hex-looking id (e.g. a git sha) or an order ref', () => {
    const sha40 = 'a'.repeat(40);
    expect(scrubPii(`build ${sha40} deployed`)).toBe(`build ${sha40} deployed`);
    expect(scrubPii('PF-10023 total 1234567890')).toBe('PF-10023 total 1234567890');
  });
});

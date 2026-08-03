import { describe, it, expect } from 'vitest';
import { scrubMobile, scrubPii } from './scrub';

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
});

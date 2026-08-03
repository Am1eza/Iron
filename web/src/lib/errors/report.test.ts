// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import { reportError } from './report';

function lastLoggedPayload(spy: ReturnType<typeof vi.spyOn>): Record<string, unknown> {
  const call = spy.mock.calls.at(-1);
  return JSON.parse(call![0] as string) as Record<string, unknown>;
}

describe('reportError', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('redacts a mobile embedded in the error message', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    reportError(new Error('OTP send failed for 09123456789'));
    expect(lastLoggedPayload(spy).message).toBe('OTP send failed for [redacted-mobile]');
  });

  it('fully redacts a context key named nationalId, not just its value', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    reportError(new Error('verification failed'), { nationalId: '0012345678' });
    expect((lastLoggedPayload(spy).context as Record<string, unknown>).nationalId).toBe('[redacted]');
  });

  it('scrubs an email inside an unlabeled context value', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    reportError(new Error('bounce'), { note: 'contact user@example.com' });
    expect((lastLoggedPayload(spy).context as Record<string, unknown>).note).toBe('contact [redacted-email]');
  });

  it('leaves an unrelated numeric context value untouched', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    reportError(new Error('proforma total mismatch'), { total: 1234567890 });
    expect((lastLoggedPayload(spy).context as Record<string, unknown>).total).toBe(1234567890);
  });
  // redact() walked one level only: scrubPii returns objects untouched, so a
  // REDACT_KEYS key even one level down reached the log and Sentry in the
  // clear. `{ user: { mobile } }` is the shape this app actually passes.
  it('redacts a sensitive key nested inside an object', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    reportError(new Error('send failed'), { user: { id: 'u1', mobile: '09123456789' } });
    const ctx = lastLoggedPayload(spy).context as Record<string, Record<string, unknown>>;
    expect(ctx.user!.mobile).toBe('[redacted]');
    expect(ctx.user!.id).toBe('u1');
  });

  it('scrubs values inside arrays and deeply nested objects', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    reportError(new Error('batch failed'), {
      batch: [{ note: 'call 09123456789' }],
      deep: { a: { b: { c: 'mail me at user@example.com' } } },
    });
    const ctx = lastLoggedPayload(spy).context as Record<string, unknown>;
    expect((ctx.batch as Array<{ note: string }>)[0]!.note).toBe('call [redacted-mobile]');
    const deep = ctx.deep as { a: { b: { c: string } } };
    expect(deep.a.b.c).toBe('mail me at [redacted-email]');
  });

  it('survives a circular context instead of hanging the logger', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const cyclic: Record<string, unknown> = { name: 'x' };
    cyclic.self = cyclic;
    expect(() => reportError(new Error('boom'), { cyclic })).not.toThrow();
    expect(lastLoggedPayload(spy).context).toBeDefined();
  });
});

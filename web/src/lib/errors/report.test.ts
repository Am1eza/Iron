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
});

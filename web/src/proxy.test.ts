// @vitest-environment node
/**
 * Item 94: /proforma/[ref] renders real customer PII (name + mobile) and
 * used to have NO rate limit at all — see api/proforma/[ref]/route.ts for the
 * sibling JSON endpoint that already had one. This locks the page in behind
 * the same limiter so an attacker can't just hit the page to bypass the API's
 * throttle while brute-forcing refs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const { rateLimitMock } = vi.hoisted(() => ({ rateLimitMock: vi.fn() }));
vi.mock('@/lib/server/utils/rateLimit', () => ({ rateLimit: rateLimitMock }));

// hasDb() is false without DATABASE_URL, so the redirect/known-paths/admin
// branches below the rate-limit check never touch a real DB in this test.

import { proxy } from './proxy';

function req(pathname: string) {
  return new NextRequest(`http://ahantime.com${pathname}`);
}

describe('proxy — /proforma/[ref] rate limiting (item 94)', () => {
  beforeEach(() => {
    rateLimitMock.mockReset();
  });

  it('returns the 429 from rateLimit without falling through when the limit is hit', async () => {
    const limited = NextResponse.json({ error: 'rate_limited' }, { status: 429 });
    rateLimitMock.mockResolvedValueOnce(limited);

    const res = await proxy(req('/proforma/PF-ABC123'));

    expect(res.status).toBe(429);
    expect(rateLimitMock).toHaveBeenCalledTimes(1);
    expect(rateLimitMock).toHaveBeenCalledWith(expect.anything(), 'proforma', {
      limit: 20,
      windowMs: 60_000,
    });
  });

  it('lets the request continue through when under the limit', async () => {
    rateLimitMock.mockResolvedValueOnce(null);

    const res = await proxy(req('/proforma/PF-ABC123'));

    expect(res.status).toBe(200);
    expect(rateLimitMock).toHaveBeenCalledTimes(1);
  });

  it('does not rate-limit unrelated paths', async () => {
    const res = await proxy(req('/about'));

    expect(rateLimitMock).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it('does not rate-limit the sibling JSON API path (it has its own limiter)', async () => {
    const res = await proxy(req('/api/proforma/PF-ABC123'));

    expect(rateLimitMock).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });
});

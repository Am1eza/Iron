import { describe, it, expect, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

/**
 * This endpoint used to accept and DISCARD every sample. These tests exist so
 * "it returns 204" can never again be mistaken for "it recorded something":
 * the 204 is asserted alongside the log line that proves the body was read.
 */
function post(body: unknown): NextRequest {
  return new NextRequest('https://ahantime.com/api/vitals', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function loggedLines(spy: ReturnType<typeof vi.spyOn>): Array<Record<string, unknown>> {
  return spy.mock.calls.map((c) => JSON.parse(String(c[0])) as Record<string, unknown>);
}

afterEach(() => vi.restoreAllMocks());

describe('POST /api/vitals', () => {
  it('records a sample and still answers 204', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = await POST(post({ name: 'LCP', value: 1800.4, rating: 'good', section: 'prices' }));
    expect(res.status).toBe(204);
    const line = loggedLines(spy)[0]!;
    expect(line.tag).toBe('ahantime:vitals');
    expect(line.name).toBe('LCP');
    expect(line.value).toBe(1800);
    expect(line.section).toBe('prices');
    expect(line.overBudget).toBe(false);
    expect(line.budget).toBe(2500);
  });

  it('flags a sample past its budget — the whole point of collecting them', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await POST(post({ name: 'LCP', value: 4200, rating: 'poor' }));
    const line = loggedLines(spy)[0]!;
    expect(line.overBudget).toBe(true);
    expect(line.level).toBe('warn');
    // No section sent → attributed to the homepage rather than dropped.
    expect(line.section).toBe('home');
  });

  it('keeps CLS precision instead of rounding it to an integer 0', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await POST(post({ name: 'CLS', value: 0.1234 }));
    expect(loggedLines(spy)[0]!.value).toBe(0.123);
  });

  it('drops a payload that fails the schema — and never 500s on it', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    for (const bad of [
      { name: 'HACK', value: 1 }, // not a known metric
      { name: 'LCP', value: 'x' }, // not a number
      { name: 'LCP', value: 1e9 }, // past the cap
      { name: 'LCP', value: 1, section: '/proforma/RQ-ABC123' }, // not a bare slug
      'not json at all',
    ]) {
      const res = await POST(post(bad));
      expect(res.status).toBe(204);
    }
    expect(spy).not.toHaveBeenCalled();
  });
});

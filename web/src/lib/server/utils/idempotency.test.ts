// @vitest-environment node
/**
 * Idempotency-Key replay: a retried request with the same key (explicit
 * header, or the same same-route fallback key) must not re-run the side
 * effect — it replays the first response instead. A different key always
 * runs again.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { createTestDb } from '@/test/db';
import { withIdempotency } from './idempotency';

let close: () => Promise<void>;

beforeAll(async () => {
  ({ close } = await createTestDb());
}, 120_000);
afterAll(async () => {
  await close();
});

function req(headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost:3000/api/admin/leads/1/proforma', { method: 'POST', headers });
}

describe('withIdempotency', () => {
  it('runs the side effect once and replays the cached response on a same-key retry', async () => {
    let calls = 0;
    const run = async () => {
      calls += 1;
      return { status: 201, body: { ref: `PF-${calls}` } };
    };

    const first = await withIdempotency(req(), 'lead.proforma', 'lead-a:admin-1:bucket', run);
    const retry = await withIdempotency(req(), 'lead.proforma', 'lead-a:admin-1:bucket', run);

    expect(calls).toBe(1);
    expect(first.status).toBe(201);
    expect(retry.status).toBe(201);
    expect(await first.json()).toEqual({ ref: 'PF-1' });
    expect(await retry.json()).toEqual({ ref: 'PF-1' }); // replayed, not PF-2
    expect(retry.headers.get('Idempotency-Replayed')).toBe('true');
  });

  it('an explicit Idempotency-Key header takes precedence over the fallback key', async () => {
    let calls = 0;
    const run = async () => {
      calls += 1;
      return { status: 201, body: { n: calls } };
    };

    // Same fallback key, but different explicit headers → must NOT collide.
    await withIdempotency(req({ 'idempotency-key': 'client-key-1' }), 'lead.order', 'same-fallback', run);
    await withIdempotency(req({ 'idempotency-key': 'client-key-2' }), 'lead.order', 'same-fallback', run);

    expect(calls).toBe(2);
  });

  it('a different fallback key runs the side effect again', async () => {
    let calls = 0;
    const run = async () => {
      calls += 1;
      return { status: 201, body: { n: calls } };
    };

    await withIdempotency(req(), 'lead.order', 'lead-b:admin-1:bucket-1', run);
    await withIdempotency(req(), 'lead.order', 'lead-b:admin-1:bucket-2', run);

    expect(calls).toBe(2);
  });

  it('releases the claim on failure so a genuine retry after an error can succeed', async () => {
    let calls = 0;
    const flaky = async () => {
      calls += 1;
      if (calls === 1) throw new Error('transient');
      return { status: 201, body: { n: calls } };
    };

    await expect(withIdempotency(req(), 'lead.order', 'flaky-key', flaky)).rejects.toThrow('transient');
    const second = await withIdempotency(req(), 'lead.order', 'flaky-key', flaky);

    expect(calls).toBe(2);
    expect(second.status).toBe(201);
  });
});

// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithLimits, ResponseTooLargeError } from './fetchWithLimits';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchWithLimits (H-199)', () => {
  it('parses a normal small JSON response', async () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ ok: true }));
    const res = new Response(bytes, { status: 200 });
    vi.stubGlobal('fetch', vi.fn(async () => res));

    const result = await fetchWithLimits(
      'https://example.test',
      {},
      { timeoutMs: 1000, maxBytes: 1024 },
    );
    expect(result.ok).toBe(true);
    expect(result.json()).toEqual({ ok: true });
  });

  it('rejects a response whose declared Content-Length exceeds the cap, without reading the body', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        c.enqueue(new Uint8Array(10));
      },
      cancel,
    });
    const res = new Response(stream, {
      status: 200,
      headers: { 'content-length': String(50 * 1024 * 1024) },
    });
    vi.stubGlobal('fetch', vi.fn(async () => res));

    await expect(
      fetchWithLimits('https://example.test', {}, { timeoutMs: 1000, maxBytes: 1024 }),
    ).rejects.toBeInstanceOf(ResponseTooLargeError);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('aborts an undeclared-length response as soon as bytes read cross the cap, before it is fully buffered', async () => {
    const cancel = vi.fn();
    let pulls = 0;
    // An upstream that keeps sending chunks forever with no Content-Length —
    // if this ever had to buffer the WHOLE response, this test would hang.
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        pulls++;
        c.enqueue(new Uint8Array(2000));
      },
      cancel,
    });
    const res = new Response(stream, { status: 200 });
    vi.stubGlobal('fetch', vi.fn(async () => res));

    await expect(
      fetchWithLimits('https://example.test', {}, { timeoutMs: 1000, maxBytes: 1024 }),
    ).rejects.toBeInstanceOf(ResponseTooLargeError);
    expect(cancel).toHaveBeenCalledOnce();
    // Rejected after the FIRST chunk crossed the cap, not after draining an
    // effectively-infinite stream.
    expect(pulls).toBeLessThan(5);
  });

  it('reports a non-ok status without throwing (caller decides what to do with it)', async () => {
    const res = new Response(JSON.stringify({ message: 'nope' }), { status: 500 });
    vi.stubGlobal('fetch', vi.fn(async () => res));

    const result = await fetchWithLimits(
      'https://example.test',
      {},
      { timeoutMs: 1000, maxBytes: 1024 },
    );
    expect(result.ok).toBe(false);
    expect(result.status).toBe(500);
    expect(result.json()).toEqual({ message: 'nope' });
  });
});

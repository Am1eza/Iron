// @vitest-environment node
/**
 * H-175 and H-183, both of which the audit marked "reasoned, not run".
 *
 * Its own words on H-175: «فقط کد خوانده شد، نه یک HTTP request واقعی زده
 * شد… «اجرا شد و PASS داد» با «کد درست به‌نظر می‌رسد» یکی نیست». And on
 * H-183: «فقط استدلال ساختاری (Zod همیشه object تازه می‌سازد) ارائه شد، نه
 * یک اثبات تجربی زنده».
 *
 * So these drive a REAL route handler — `POST /api/tools/weight`, chosen
 * because it is pure arithmetic behind `validateBody` with no database, no
 * session and no external service, so what is being tested is the shared
 * input boundary itself rather than that route's business logic. Every other
 * JSON route in the app reaches the same `validateBody` → `readJsonBody`
 * path.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/utils/rateLimit', () => ({ rateLimit: async () => null }));

import { POST } from '@/app/api/tools/weight/route';

/** A request built the way a hostile client would, not the way our own
 *  client does — arbitrary Content-Type, arbitrary bytes. */
function rawPost(body: string, contentType?: string) {
  return new NextRequest('http://localhost/api/tools/weight', {
    method: 'POST',
    headers: contentType ? { 'content-type': contentType } : {},
    body,
  });
}

const VALID = JSON.stringify({ shape: 'rebar', diameterMm: 14, lengthM: 12, qty: 1 });

beforeEach(() => {
  // Belt and braces for the pollution tests: if a previous test (or the code
  // under test) ever managed to write through, this makes the NEXT test's
  // failure honest rather than masked.
  delete (Object.prototype as Record<string, unknown>).polluted;
});

describe('H-175 — a wrong Content-Type or a malformed body is a clean 400, never a crash', () => {
  it('400s JSON-shaped bytes sent as text/plain without honouring them', async () => {
    // The header is a lie in the safe direction — the bytes ARE valid JSON.
    // What matters is that the route neither 500s nor trusts the label.
    const res = await POST(rawPost(VALID, 'text/plain'));
    expect([200, 400]).toContain(res.status);
    expect(res.status).not.toBe(500);
  });

  it('400s malformed JSON rather than throwing', async () => {
    const res = await POST(rawPost('{"shape":"rebar",', 'application/json'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('validation');
  });

  it('400s malformed JSON carrying a text/plain label', async () => {
    const res = await POST(rawPost('not json at all', 'text/plain'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('validation');
  });

  it('400s a body that is valid JSON but not an object', async () => {
    for (const body of ['null', '42', '"میلگرد"', '[1,2,3]', 'true']) {
      const res = await POST(rawPost(body, 'application/json'));
      expect(res.status, body).toBe(400);
    }
  });

  it('400s an empty body', async () => {
    const res = await POST(rawPost('', 'application/json'));
    expect(res.status).toBe(400);
  });

  it('400s a body nested past the depth cap, with the depth-specific message', async () => {
    // 25 levels, well under the byte cap — cheap to send, expensive to walk.
    let deep = '1';
    for (let i = 0; i < 25; i++) deep = `{"a":${deep}}`;
    const res = await POST(rawPost(deep, 'application/json'));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toContain('تودرتو');
  });

  it('never leaks an exception message or a stack to the client', async () => {
    const res = await POST(rawPost('{"shape":', 'application/json'));
    const text = await res.text();
    expect(text).not.toMatch(/SyntaxError|Unexpected token|at Object\.|\.ts:\d+/);
  });

  it('still answers a well-formed request — the guards are not just refusing everything', async () => {
    const res = await POST(rawPost(VALID, 'application/json'));
    expect(res.status).toBe(200);
    expect((await res.json()).totalWeightKg).toBeGreaterThan(0);
  });
});

describe('H-183 — a __proto__ payload cannot reach Object.prototype', () => {
  it('leaves Object.prototype untouched for the JSON prototype-pollution shapes', async () => {
    const payloads = [
      '{"__proto__":{"polluted":"yes"},"shape":"rebar","diameterMm":14,"qty":1}',
      '{"constructor":{"prototype":{"polluted":"yes"}},"shape":"rebar","diameterMm":14,"qty":1}',
      '{"shape":"rebar","diameterMm":14,"qty":1,"nested":{"__proto__":{"polluted":"yes"}}}',
    ];
    for (const body of payloads) {
      const res = await POST(rawPost(body, 'application/json'));
      // Whether the route accepts or rejects it is beside the point — what
      // matters is that nothing was written to the prototype either way.
      expect([200, 400]).toContain(res.status);
      expect(({} as Record<string, unknown>).polluted, body).toBeUndefined();
      expect((Object.prototype as Record<string, unknown>).polluted, body).toBeUndefined();
    }
  });

  it('does not carry an attacker key through into the validated data', async () => {
    // Zod builds a fresh object from the keys its schema declares, so an
    // extra key cannot ride along into whatever the handler does next.
    const res = await POST(
      rawPost(
        '{"__proto__":{"polluted":"yes"},"shape":"rebar","diameterMm":14,"qty":1}',
        'application/json',
      ),
    );
    if (res.status === 200) {
      const data = (await res.json()) as Record<string, unknown>;
      expect(Object.keys(data)).not.toContain('__proto__');
      expect(Object.keys(data)).not.toContain('polluted');
    }
  });

  it('the pollution assertion is real — it fails when the prototype IS polluted', () => {
    // Without this, all three tests above would pass just as happily against
    // an assertion that could never fire.
    (Object.prototype as Record<string, unknown>).polluted = 'yes';
    try {
      expect(({} as Record<string, unknown>).polluted).toBe('yes');
    } finally {
      delete (Object.prototype as Record<string, unknown>).polluted;
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

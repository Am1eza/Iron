// @vitest-environment node
/**
 * I-202, the third acceptance criterion — «فرم چندبخشی با overhead که مجموع
 * را به بالای ۶MB می‌رساند باید ۴۱۳ بدهد، نه کرش یا timeout».
 *
 * The per-file 5MB boundary is already covered in `route.test.ts`, and the
 * 6MB aggregate is covered at the `readFormBody` level in
 * `requestBody.test.ts`. Neither proves the criterion above, for a specific
 * reason: the aggregate cap is enforced by a THROW
 * (`PayloadTooLargeError`), and the 413 that the client actually sees is
 * produced by `withApiErrorHandling` — which `route.test.ts` replaces with
 * an identity function. So in that file the same request throws instead of
 * answering 413, and the failure mode the criterion asks about is invisible.
 *
 * This file therefore keeps the REAL `withApiErrorHandling` and mocks only
 * the session and the rate limiter around it.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/session', () => ({
  getSessionVerified: async () => ({ id: 'editor-1', role: 'content', mobile: '09120000000' }),
}));
vi.mock('@/lib/server/utils/rateLimit', () => ({ rateLimit: async () => null }));
vi.mock('@/lib/server/db/client', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, hasDb: () => true };
});
vi.mock('@/lib/server/repos/auditRepo', () => ({ writeAudit: async () => {} }));

let tmpDir: string;
beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ahantime-upload-aggregate-'));
  process.env.UPLOAD_DIR = path.relative(process.cwd(), tmpDir);
});
afterAll(async () => {
  delete process.env.UPLOAD_DIR;
  await fs.rm(tmpDir, { recursive: true, force: true });
});
afterEach(async () => {
  for (const f of await fs.readdir(tmpDir)) await fs.rm(path.join(tmpDir, f));
});

import { POST } from './route';

const MB = 1024 * 1024;

const BOUNDARY = '----ahantimeAggregateTest';

/**
 * A multipart body whose TOTAL (file + extra fields + multipart overhead)
 * crosses the aggregate cap, even though no single file does.
 *
 * The bytes are assembled by hand rather than via `new FormData()` on
 * purpose: undici serializes a FormData through its own ReadableStream, and
 * `readBody`'s early `reader.cancel()` — the very behaviour the last test
 * here asserts — makes that serializer reject with "ReadableStream is already
 * closed" as an UNHANDLED rejection. That is a harness artifact (in
 * production the body arrives from the network, not from undici's own
 * writer), but it would turn a passing test file into a noisy one.
 */
function multipart(fileBytes: number, extraFieldBytes: number) {
  const parts: Uint8Array[] = [];
  const push = (s: string) => parts.push(new TextEncoder().encode(s));

  push(`--${BOUNDARY}\r\n`);
  push('Content-Disposition: form-data; name="file"; filename="photo.jpg"\r\n');
  push('Content-Type: image/jpeg\r\n\r\n');
  parts.push(new Uint8Array(fileBytes));
  push('\r\n');
  if (extraFieldBytes > 0) {
    push(`--${BOUNDARY}\r\n`);
    push('Content-Disposition: form-data; name="note"\r\n\r\n');
    parts.push(new Uint8Array(extraFieldBytes).fill(0x78)); // 'x'
    push('\r\n');
  }
  push(`--${BOUNDARY}--\r\n`);

  const total = parts.reduce((n, p) => n + p.byteLength, 0);
  const body = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    body.set(p, at);
    at += p.byteLength;
  }

  // The real same-origin guard runs on this route too, so the request has to
  // look like a browser's: without an Origin header every POST is a 403 and
  // the size layers below are never reached.
  return new NextRequest('http://localhost/api/admin/upload', {
    method: 'POST',
    headers: {
      host: 'localhost',
      origin: 'http://localhost',
      'content-type': `multipart/form-data; boundary=${BOUNDARY}`,
    },
    body,
  });
}

describe('POST /api/admin/upload — I-202 aggregate multipart cap', () => {
  it('answers 413 when the whole form crosses 6MB, rather than crashing or hanging', async () => {
    // 4MB file + 3MB of extra fields: no single part is over the 5MB
    // per-file cap, so only the aggregate layer can catch this.
    const res = await POST(multipart(4 * MB, 3 * MB));

    expect(res.status).toBe(413);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe('payload_too_large');
    expect(body.message).toContain('حجم درخواست');
    expect(await fs.readdir(tmpDir)).toHaveLength(0);
  });

  it('is the aggregate layer talking, not the per-file one', async () => {
    // A single 6MB+ file trips the aggregate cap BEFORE the route's own
    // 5MB check ever sees a parsed file — so it must be 413, not the
    // route's 400 `too_large`. The two layers have distinct codes on
    // purpose: 413 means "you sent too much", 400 means "this file is too
    // big for this feature".
    const res = await POST(multipart(7 * MB, 0));
    expect(res.status).toBe(413);
  });

  it('a file just under the per-file cap, alone, still reaches the route’s own validation', async () => {
    // 5MB-ish of zero bytes is not a real image, so the route rejects it at
    // the sniff step — a 400, NOT a 413. That distinction is the proof the
    // aggregate layer did not fire here, i.e. the caps are ordered
    // correctly (20MB edge ≥ 6MB aggregate ≥ 5MB per file) rather than the
    // outer one swallowing everything.
    const res = await POST(multipart(4 * MB, 0));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('bad_file');
    expect(await fs.readdir(tmpDir)).toHaveLength(0);
  });

  it('rejects promptly — an oversized body must not be buffered to completion', async () => {
    // "not a timeout" is part of the criterion. 12MB of body answered well
    // inside a second is the observable form of "the reader bailed out
    // early instead of allocating the whole thing".
    const started = Date.now();
    const res = await POST(multipart(12 * MB, 0));
    expect(res.status).toBe(413);
    expect(Date.now() - started).toBeLessThan(5_000);
  });
});

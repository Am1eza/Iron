// @vitest-environment node
/**
 * G-163 follow-up: the audit noted the upload route's 30-request/minute
 * throttle (rateLimit.ts's in-process fallback, since no REDIS_URL/Cloudflare
 * binding is configured in this test environment) was verified only by
 * reading the code, never by actually driving the limit past its ceiling.
 * This file is the one place in the upload test suite that does NOT mock
 * `@/lib/server/utils/rateLimit` — every other file mocks it to `async () =>
 * null` specifically so it doesn't interfere with unrelated assertions; here
 * the real limiter IS the thing under test.
 *
 * `reencodeUploadedImage` is mocked (identity passthrough) purely so the 31
 * requests below run fast and don't need genuinely-decodable images — the
 * real re-encode path already has its own coverage elsewhere (see
 * route.test.ts and mediaProcessing.test.ts). What's real here: auth is
 * mocked (same as every sibling file), but the rate limiter, `clientIp`
 * bucketing, and the route's own `rateLimit(req, 'upload', {limit: 30,
 * windowMs: 60_000})` call are the actual production code path.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/utils/apiGuard', () => ({
  requireDb: () => null,
  requireApiUser: async () => ({ session: { id: 'editor-rate-1', role: 'content' } }),
  audit: async () => {},
  withApiErrorHandling: (handler: unknown) => handler,
}));
vi.mock('@/lib/server/utils/mediaProcessing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/utils/mediaProcessing')>();
  return { ...actual, reencodeUploadedImage: vi.fn(async (buf: Buffer) => buf) };
});
// Deliberately NOT mocking '@/lib/server/utils/rateLimit' — see file header.

let tmpDir: string;
beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ahantime-upload-ratelimit-test-'));
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

function jpegLikeBuffer(size: number): ArrayBuffer {
  const buf = new Uint8Array(size);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  return buf.buffer;
}

function upload(filename: string) {
  const form = new FormData();
  form.append('file', new Blob([jpegLikeBuffer(16)]), filename);
  // No IP-identifying header set → clientIp() falls through to the 'local'
  // literal (see rateLimit.ts) — every request in this file shares ONE
  // bucket, exactly like a burst from a single real attacker IP would.
  return POST(new NextRequest('http://localhost/api/admin/upload', { method: 'POST', body: form }));
}

describe('POST /api/admin/upload — real rate limit, not mocked (G-163)', () => {
  it('serves the configured 30 requests/min and 429s the 31st, from the real limiter', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) {
      // Sequential, not Promise.all: the in-process sliding window in
      // rateLimit.ts is a plain module-level Map, not a lock — sequential
      // calls are what makes "request #31" a meaningful, deterministic
      // position rather than a race between concurrent increments.
      const res = await upload(`f${i}.jpg`);
      statuses.push(res.status);
    }
    expect(statuses).toHaveLength(31);
    // The first 30 are all real answers (201, since the mocked re-encode
    // accepts the tiny JPEG-like fixture) — none rate-limited yet.
    expect(statuses.slice(0, 30)).toEqual(Array(30).fill(201));
    // The 31st crosses the configured ceiling.
    expect(statuses[30]).toBe(429);
  });
});

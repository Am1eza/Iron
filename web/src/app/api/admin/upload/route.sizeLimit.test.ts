// @vitest-environment node
/**
 * G-163 follow-up: the audit noted the 5MB size cap was verified only by
 * reading the code (`if (file.size > MAX_BYTES) ...` in route.ts), never by
 * an actual near-cap payload through the real route. This file closes that
 * specific gap: a payload at exactly the cap succeeds, one byte over is
 * rejected.
 *
 * `reencodeUploadedImage` is mocked here (identity passthrough) so the
 * fixtures can be arbitrary bytes behind a valid JPEG magic-byte prefix
 * instead of a genuinely-decodable ~5MB photo — the real sharp decode/
 * re-encode path (dimension cap, EXIF strip, corrupt-input handling) is
 * already exercised end to end with real images in route.test.ts and in
 * mediaProcessing.test.ts's own unit suite. Re-deriving that here would only
 * add a slow, flaky-to-tune fixture without proving anything new; this file
 * stays focused on the ONE boundary that was previously unverified by any
 * test: the size gate itself.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/utils/apiGuard', () => ({
  requireDb: () => null,
  requireApiUser: async () => ({ session: { id: 'editor-size-1', role: 'content' } }),
  audit: async () => {},
  withApiErrorHandling: (handler: unknown) => handler,
}));
vi.mock('@/lib/server/utils/rateLimit', () => ({ rateLimit: async () => null }));
vi.mock('@/lib/server/utils/mediaProcessing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/utils/mediaProcessing')>();
  return { ...actual, reencodeUploadedImage: vi.fn(async (buf: Buffer) => buf) };
});

let tmpDir: string;
beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ahantime-upload-sizelimit-test-'));
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

// Mirrors route.ts's own MAX_BYTES — not imported directly since it isn't
// exported (route.ts only exports POST, per Next's restricted route-file
// export surface; see that file's header comment). Kept as a literal here,
// same as the file it verifies.
const MAX_BYTES = 5 * 1024 * 1024;

function jpegLikeBuffer(size: number): ArrayBuffer {
  const buf = new Uint8Array(size);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff; // sniffImageExt's real JPEG magic-byte check — everything past this is filler.
  return buf.buffer;
}

function upload(bytes: ArrayBuffer, filename = 'boundary.jpg') {
  const form = new FormData();
  form.append('file', new Blob([bytes]), filename);
  return POST(new NextRequest('http://localhost/api/admin/upload', { method: 'POST', body: form }));
}

describe('POST /api/admin/upload — size cap boundary (G-163)', () => {
  it('accepts a payload at exactly the 5MB cap', async () => {
    const res = await upload(jpegLikeBuffer(MAX_BYTES));
    expect(res.status).toBe(201);
    expect(await fs.readdir(tmpDir)).toHaveLength(1);
  });

  it('rejects a payload one byte over the 5MB cap, and writes nothing to disk', async () => {
    const res = await upload(jpegLikeBuffer(MAX_BYTES + 1));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('too_large');
    expect(await fs.readdir(tmpDir)).toHaveLength(0);
  });
});

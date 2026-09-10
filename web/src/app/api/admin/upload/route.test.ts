// @vitest-environment node
/**
 * G-163: end-to-end proof that the upload endpoint's REAL security boundary
 * (magic-byte sniffing — imageSniff.test.ts covers the sniffer in isolation)
 * actually rejects a disguised file through the full route: auth, rate
 * limit, and disk write wiring included, not just the extracted sniffer
 * function on its own.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/utils/apiGuard', () => ({
  requireDb: () => null,
  requireApiUser: async () => ({ session: { id: 'editor-1', role: 'content' } }),
  audit: async () => {},
  withApiErrorHandling: (handler: unknown) => handler,
}));
vi.mock('@/lib/server/utils/rateLimit', () => ({ rateLimit: async () => null }));

let tmpDir: string;
beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ahantime-upload-test-'));
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

function upload(bytes: ArrayBuffer, filename: string) {
  const form = new FormData();
  form.append('file', new Blob([bytes]), filename);
  return POST(new NextRequest('http://localhost/api/admin/upload', { method: 'POST', body: form }));
}

describe('POST /api/admin/upload — content-sniffing boundary, end to end', () => {
  it('rejects an HTML/script payload disguised with a .jpg filename, and writes nothing to disk', async () => {
    const res = await upload(new TextEncoder().encode('<script>alert(1)</script>').buffer, 'totally-a-photo.jpg');
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('bad_file');
    expect(await fs.readdir(tmpDir)).toHaveLength(0);
  });

  it('rejects a PDF disguised as .png', async () => {
    const res = await upload(new TextEncoder().encode('%PDF-1.4').buffer, 'x.png');
    expect(res.status).toBe(400);
  });

  it('accepts a real JPEG and writes it under a server-generated name, never the client filename', async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]).buffer;
    const res = await upload(jpeg, '../../etc/passwd.jpg');
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.url).toMatch(/^\/uploads\/[0-9A-HJKMNP-TV-Z]{26}\.jpg$/);
    const written = await fs.readdir(tmpDir);
    expect(written).toHaveLength(1);
    expect(written[0]).not.toContain('passwd');
    expect(written[0]).not.toContain('..');
  });
});

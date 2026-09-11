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
import sharp from 'sharp';
import { MAX_DIMENSION_PX } from '@/lib/server/utils/mediaProcessing';

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
    // A genuinely decodable JPEG, not just 6 magic-byte-shaped bytes — since
    // I-206/207/209 (see mediaProcessing.ts), the route actually decodes and
    // re-encodes every accepted upload, so the fixture must be a real image.
    const jpeg = await sharp({ create: { width: 40, height: 30, channels: 3, background: { r: 10, g: 10, b: 10 } } })
      .jpeg()
      .toBuffer();
    const res = await upload(jpeg.buffer.slice(jpeg.byteOffset, jpeg.byteOffset + jpeg.byteLength), '../../etc/passwd.jpg');
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.url).toMatch(/^\/uploads\/[0-9A-HJKMNP-TV-Z]{26}\.jpg$/);
    const written = await fs.readdir(tmpDir);
    expect(written).toHaveLength(1);
    expect(written[0]).not.toContain('passwd');
    expect(written[0]).not.toContain('..');
  });
});

describe('POST /api/admin/upload — server-side re-encode boundary (I-206/207/209)', () => {
  it('rejects a declared-huge-dimension image (decompression bomb) with a clean 4xx, and writes nothing to disk', async () => {
    const bomb = await sharp({
      create: { width: 8500, height: 8500, channels: 3, background: { r: 1, g: 1, b: 1 } },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();
    const res = await upload(bomb.buffer.slice(bomb.byteOffset, bomb.byteOffset + bomb.byteLength), 'huge.png');
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('image_too_large');
    expect(await fs.readdir(tmpDir)).toHaveLength(0);
  });

  it('rejects a truncated/corrupt JPEG (valid header, cut-off body) instead of storing an unusable file', async () => {
    const good = await sharp({ create: { width: 100, height: 80, channels: 3, background: { r: 5, g: 5, b: 5 } } })
      .jpeg()
      .toBuffer();
    const truncated = good.subarray(0, Math.floor(good.length / 3));
    const res = await upload(truncated.buffer.slice(truncated.byteOffset, truncated.byteOffset + truncated.byteLength), 'broken.jpg');
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('bad_file');
    expect(await fs.readdir(tmpDir)).toHaveLength(0);
  });

  it('strips EXIF from an uploaded JPEG that carries it, and the stored file is a genuine re-encode', async () => {
    const withExif = await sharp({ create: { width: 40, height: 30, channels: 3, background: { r: 8, g: 8, b: 8 } } })
      .withMetadata({ exif: { IFD0: { Copyright: 'ACME Corp' } } })
      .jpeg()
      .toBuffer();
    const res = await upload(withExif.buffer.slice(withExif.byteOffset, withExif.byteOffset + withExif.byteLength), 'photo.jpg');
    expect(res.status).toBe(201);
    const { url } = await res.json();
    const stored = await fs.readFile(path.join(tmpDir, path.basename(url)));
    const meta = await sharp(stored).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.width).toBe(40);
    expect(meta.height).toBe(30);
  });

  it('accepts an image exactly at the dimension boundary', async () => {
    const atLimit = await sharp({
      create: { width: MAX_DIMENSION_PX, height: 40, channels: 3, background: { r: 2, g: 2, b: 2 } },
    })
      .jpeg()
      .toBuffer();
    const res = await upload(atLimit.buffer.slice(atLimit.byteOffset, atLimit.byteOffset + atLimit.byteLength), 'wide.jpg');
    expect(res.status).toBe(201);
  });
});

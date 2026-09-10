// @vitest-environment node
/**
 * I-206/207/209/212 — the customer-facing letterhead-logo upload shares the
 * exact same pipeline as /api/admin/upload (see the route's own docstring):
 * magic-byte sniff, server-side re-encode (EXIF strip + dimension/pixel
 * cap), ULID naming — plus its own I-212 concern, a logo REPLACE must not
 * leave the previous file behind forever.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { NextRequest } from 'next/server';
import sharp from 'sharp';

vi.mock('@/lib/auth/session', () => ({ getSessionVerified: async () => ({ id: 'u1', role: 'customer' }) }));
vi.mock('@/lib/auth/origin', () => ({ assertSameOrigin: () => null }));
vi.mock('@/lib/server/utils/rateLimit', () => ({ rateLimit: async () => null }));

let tmpDir: string;
beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ahantime-letterhead-logo-test-'));
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
  return POST(new NextRequest('http://localhost/api/me/letterhead/logo', { method: 'POST', body: form }));
}

function bufToArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

describe('POST /api/me/letterhead/logo', () => {
  it('404s for a non-پولادی member (no club DB access needed to prove the gate)', async () => {
    const { createTestDb } = await import('@/test/db');
    const schema = await import('@/lib/server/db/schema');
    const { db, close } = await createTestDb();
    try {
      await db.insert(schema.users).values({ id: 'u1', mobile: '09120000001', role: 'customer', isActive: true });
      const jpeg = await sharp({ create: { width: 20, height: 20, channels: 3, background: { r: 1, g: 1, b: 1 } } })
        .jpeg()
        .toBuffer();
      const res = await upload(bufToArrayBuffer(jpeg), 'logo.jpg');
      expect(res.status).toBe(404);
    } finally {
      await close();
    }
  });

  it('accepts a real JPEG, strips EXIF, and saves it as the letterhead logo', async () => {
    const { createTestDb } = await import('@/test/db');
    const schema = await import('@/lib/server/db/schema');
    const { joinClub, setTier, getLetterhead } = await import('@/lib/server/repos/clubRepo');
    const { db, close } = await createTestDb();
    try {
      await db.insert(schema.users).values({ id: 'u1', mobile: '09120000001', role: 'customer', isActive: true });
      await joinClub('u1');
      await setTier('u1', 'poolad');

      const withExif = await sharp({ create: { width: 50, height: 40, channels: 3, background: { r: 2, g: 2, b: 2 } } })
        .withMetadata({ exif: { IFD0: { Copyright: 'ACME' } } })
        .jpeg()
        .toBuffer();
      const res = await upload(bufToArrayBuffer(withExif), 'logo.jpg');
      expect(res.status).toBe(201);
      const { url } = await res.json();

      const stored = await fs.readFile(path.join(tmpDir, path.basename(url)));
      const meta = await sharp(stored).metadata();
      expect(meta.exif).toBeUndefined();

      const letterhead = await getLetterhead('u1');
      expect(letterhead?.logoUrl).toBe(url);
    } finally {
      await close();
    }
  });

  it('replacing the logo deletes the previous file from disk (I-212)', async () => {
    const { createTestDb } = await import('@/test/db');
    const schema = await import('@/lib/server/db/schema');
    const { joinClub, setTier } = await import('@/lib/server/repos/clubRepo');
    const { db, close } = await createTestDb();
    try {
      await db.insert(schema.users).values({ id: 'u1', mobile: '09120000001', role: 'customer', isActive: true });
      await joinClub('u1');
      await setTier('u1', 'poolad');

      const first = await sharp({ create: { width: 30, height: 30, channels: 3, background: { r: 3, g: 3, b: 3 } } })
        .jpeg()
        .toBuffer();
      const res1 = await upload(bufToArrayBuffer(first), 'logo1.jpg');
      expect(res1.status).toBe(201);
      const { url: url1 } = await res1.json();
      expect(await fs.readdir(tmpDir)).toContain(path.basename(url1));

      const second = await sharp({ create: { width: 30, height: 30, channels: 3, background: { r: 4, g: 4, b: 4 } } })
        .jpeg()
        .toBuffer();
      const res2 = await upload(bufToArrayBuffer(second), 'logo2.jpg');
      expect(res2.status).toBe(201);
      const { url: url2 } = await res2.json();

      const remaining = await fs.readdir(tmpDir);
      expect(remaining).not.toContain(path.basename(url1));
      expect(remaining).toContain(path.basename(url2));
    } finally {
      await close();
    }
  });

  it('rejects a decompression-bomb-shaped image with a clean 4xx', async () => {
    const { createTestDb } = await import('@/test/db');
    const schema = await import('@/lib/server/db/schema');
    const { joinClub, setTier } = await import('@/lib/server/repos/clubRepo');
    const { db, close } = await createTestDb();
    try {
      await db.insert(schema.users).values({ id: 'u1', mobile: '09120000001', role: 'customer', isActive: true });
      await joinClub('u1');
      await setTier('u1', 'poolad');

      const bomb = await sharp({ create: { width: 8500, height: 8500, channels: 3, background: { r: 1, g: 1, b: 1 } } })
        .png({ compressionLevel: 9 })
        .toBuffer();
      const res = await upload(bufToArrayBuffer(bomb), 'huge.png');
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('image_too_large');
      expect(await fs.readdir(tmpDir)).toHaveLength(0);
    } finally {
      await close();
    }
  });
});

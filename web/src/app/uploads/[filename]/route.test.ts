import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';

describe('GET /uploads/:filename', () => {
  // uploadStorage.ts resolves UPLOAD_DIR with `path.join(process.cwd(), ...)`
  // — unlike path.resolve, path.join does NOT special-case an absolute
  // second argument, so UPLOAD_DIR must stay relative here to land exactly
  // where the route itself will look.
  let relDir: string;
  let absDir: string;
  const originalEnv = process.env.UPLOAD_DIR;

  beforeEach(async () => {
    relDir = `.tmp-uploads-test-${Math.random().toString(36).slice(2)}`;
    absDir = path.join(process.cwd(), relDir);
    await fs.mkdir(absDir, { recursive: true });
    process.env.UPLOAD_DIR = relDir;
  });
  afterEach(async () => {
    process.env.UPLOAD_DIR = originalEnv;
    await fs.rm(absDir, { recursive: true, force: true });
  });

  async function get(filename: string) {
    const { GET } = await import('./route');
    const req = new NextRequest(`https://panel.ahantime.com/uploads/${filename}`);
    return GET(req, { params: Promise.resolve({ filename }) });
  }

  it('serves a real, correctly-named file with the right content-type and cache header', async () => {
    const name = '01ARZ3NDEKTSV4RRFFQ69G5FAV.jpg';
    await fs.writeFile(path.join(absDir, name), Buffer.from('fake-jpeg-bytes'));

    const res = await get(name);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe('fake-jpeg-bytes');
  });

  it('reads the file fresh from disk on every request — no staleness window for a file written after the process started', async () => {
    const name = '01ARZ3NDEKTSV4RRFFQ69G5FAW.png';
    // Deliberately no write yet — proves this isn't served from some
    // snapshot taken at import time.
    await expect(get(name)).resolves.toMatchObject({ status: 404 });

    await fs.writeFile(path.join(absDir, name), Buffer.from('fake-png-bytes'));
    const res = await get(name);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
  });

  it('404s a well-formed filename that does not exist on disk', async () => {
    const res = await get('01ARZ3NDEKTSV4RRFFQ69G5FAX.webp');
    expect(res.status).toBe(404);
  });

  it.each([
    'not-a-ulid.jpg',
    '01ARZ3NDEKTSV4RRFFQ69G5FAV.gif',
    '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    '../../etc/passwd',
    '..%2f..%2fetc%2fpasswd.jpg',
    '01ARZ3NDEKTSV4RRFFQ69G5FAV.jpg/../../etc/passwd',
    'ILOU3NDEKTSV4RRFFQ69G5FAV.jpg', // I/L/O/U aren't valid Crockford base32
  ])('rejects a filename that is not exactly the ulid.ext shape: %s', async (bad) => {
    const res = await get(bad);
    expect(res.status).toBe(404);
  });
});

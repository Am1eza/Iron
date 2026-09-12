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

// I-211 (docs/audit-upload-media-I.md) — the audit's own words on the ONE
// documented, theoretical risk on an otherwise "effectively fully sound"
// (96/100) control: "چون Content-Type از پسوند مشتق می‌شود ... این وابستگی
// به‌درستی مستند شده" — i.e. the ENTIRE Content-Type safety property rests on
// two facts staying true together: (1) `MIME_FOR_EXT`'s key set is EXACTLY
// the three extensions `sniffImageExt` can ever produce (never a fourth,
// broader allowlist that could accept something sniffImageExt itself would
// reject), and (2) every value in it is a real image MIME type, never
// something a browser could execute (e.g. text/html). Regressing either one
// — e.g. widening MIME_FOR_EXT for a new extension without sniffImageExt
// gaining a matching magic-byte case first — is exactly the "sniffImageExt
// bypassed at upload time" scenario the audit's finding describes, made
// concrete and CI-checkable instead of only a documented assumption. The
// audit's own Acceptance Criteria for I-211 is the second assertion below:
// "هیچ پاسخ /uploads/* بدون nosniff یا با Content-Type خارج از سه مقدار مجاز
// سرویس داده نمی‌شود" — the sitewide `X-Content-Type-Options: nosniff` half
// of that is set in next.config.mjs (CLAUDE.md: the ONE place headers are
// set), so it's checked structurally here rather than re-implemented.
describe('I-211 — Content-Type derivation stays locked to exactly the sniffed image formats', () => {
  it('MIME_FOR_EXT has exactly the three extensions sniffImageExt can produce, each mapped to a real image MIME type', async () => {
    const { MIME_FOR_EXT } = await import('@/lib/server/utils/uploadStorage');
    expect(Object.keys(MIME_FOR_EXT).sort()).toEqual(['jpg', 'png', 'webp']);
    for (const mime of Object.values(MIME_FOR_EXT)) {
      expect(mime).toMatch(/^image\/(jpeg|png|webp)$/);
    }
  });

  it("next.config.mjs still sets X-Content-Type-Options: nosniff sitewide (source: '/:path*', unconditional)", async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const config = fs.readFileSync(path.join(process.cwd(), 'next.config.mjs'), 'utf8');
    // Sitewide baseline security-headers block: `source: '/:path*'` with no
    // `has:` host/path restriction, containing the nosniff header. A version
    // scoped only to /uploads/* or gated behind a `has:` clause would no
    // longer cover every response the way I-211's evidence (a live curl
    // against /uploads/nonexistent.jpg) demonstrated.
    const sitewideBlockMatch = /source:\s*'\/:path\*',\s*headers:\s*\[([\s\S]*?)\]\s*,?\s*\}/.exec(config);
    expect(sitewideBlockMatch, 'could not find the sitewide `/:path*` headers() block in next.config.mjs').toBeTruthy();
    expect(sitewideBlockMatch![1]).toMatch(
      /key:\s*'X-Content-Type-Options',\s*value:\s*'nosniff'/,
    );
  });
});

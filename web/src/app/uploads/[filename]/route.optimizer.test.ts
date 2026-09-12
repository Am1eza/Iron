// @vitest-environment node
/**
 * I-215 (docs/audit-upload-media-I.md) — end-to-end proof of what actually
 * happens when a header-valid but body-corrupt image reaches the FULL
 * serve+optimize path, not just `sniffImageExt`/`reencodeUploadedImage` in
 * isolation (both already covered elsewhere — see mediaProcessing.test.ts
 * and upload/route.test.ts, which prove such a file is now rejected AT
 * UPLOAD TIME for any NEW upload since I-206/207/209 closed).
 *
 * That fix does not retroactively touch a file already sitting on disk from
 * before it shipped (the audit's own "این fix ارتجاعی نیست" caveat), and
 * `app/uploads/[filename]/route.ts` itself never decodes anything — it is a
 * dumb byte-server (fs.readFile + a Content-Type keyed off the filename
 * extension). So this test simulates exactly that residual case: a
 * truncated-but-magic-byte-valid JPEG already on disk (as if uploaded before
 * this session's fix, or written by any other means), and exercises BOTH
 * halves of "serve or optimize it" with REAL code, not mocks:
 *
 *   1. This app's own GET route — proven to serve the corrupt bytes as-is
 *      (200, correct Content-Type), never crashing on content it never
 *      inspects.
 *   2. Next.js's actual image-optimizer module (`next/dist/server/
 *      image-optimizer.js`'s `imageOptimizer`) — the exact function
 *      `/_next/image` uses internally to decode/resize/re-encode — fed the
 *      SAME bytes this route just served.
 *
 * This is an internal (non-exported-from-`next/server`) Next.js module, one
 * version bump away from moving; if this import starts failing, that's a
 * signal the Next.js internals changed, not that this test is wrong — see
 * package.json's pinned `next` version.
 *
 * MEASURED (not assumed) result of step 2, worth recording precisely because
 * it does NOT match the audit's own wishlist ("نه ۵۰۰ بدون‌جزئیات و نه یک
 * تصویر خراب سرویس‌داده‌شده با ۲۰۰"): `imageOptimizer` catches the sharp
 * decode failure internally and, because the corrupt buffer still magic-byte
 * -detects as a real image type, falls back to returning the ORIGINAL
 * upstream buffer verbatim (with the decode error attached on `.error`,
 * never thrown) rather than throwing `ImageError`. Next's own `sendResponse`
 * ignores that `.error` field entirely and always writes a 200. So the
 * genuinely accurate claim this test can make is: the optimizer never
 * throws, hangs, or 500s on a corrupt-but-header-valid file (the concrete
 * availability risk I-215 raised) — but the browser still ends up with the
 * corrupt bytes and a 200, which is a real, narrow residual gap worth
 * knowing about rather than asserting away.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';
import sharp from 'sharp';
import { imageOptimizer, type ImageError as ImageErrorType } from 'next/dist/server/image-optimizer.js';
import { sniffImageExt } from '@/lib/server/utils/imageSniff';

describe('GET /uploads/:filename + Next Image Optimizer — I-215 truncated/corrupt file, real code paths', () => {
  let relDir: string;
  let absDir: string;
  const originalEnv = process.env.UPLOAD_DIR;

  beforeEach(async () => {
    relDir = `.tmp-uploads-optimizer-test-${Math.random().toString(36).slice(2)}`;
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
    const req = new NextRequest(`https://ahantime.com/uploads/${filename}`);
    return GET(req, { params: Promise.resolve({ filename }) });
  }

  it('the serving route returns a corrupt-but-header-valid file as-is (200, correct Content-Type) instead of crashing', async () => {
    const good = await sharp({ create: { width: 200, height: 150, channels: 3, background: { r: 9, g: 9, b: 9 } } })
      .jpeg()
      .toBuffer();
    const truncated = good.subarray(0, Math.floor(good.length / 3));
    expect(sniffImageExt(truncated)).toBe('jpg'); // still passes the magic-byte check — this is the exact gap I-215 raised

    const name = '01ARZ3NDEKTSV4RRFFQ69G5FAZ.jpg';
    await fs.writeFile(path.join(absDir, name), truncated);

    const res = await get(name);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    const served = Buffer.from(await res.arrayBuffer());
    expect(served.equals(truncated)).toBe(true);

    // Feed the ACTUAL bytes this route just served into Next's REAL
    // optimizer — the same object shape (`ImageUpstream`) and the same
    // `imageOptimizer` function `/_next/image`'s route handler calls.
    const nextConfig = {
      experimental: {},
      images: { dangerouslyAllowSVG: false, minimumCacheTTL: 60 },
    };
    let result: Awaited<ReturnType<typeof imageOptimizer>> | undefined;
    let thrown: unknown;
    try {
      result = await imageOptimizer(
        { buffer: served, contentType: null, cacheControl: null, etag: 'test-etag' },
        { href: `/uploads/${name}`, width: 640, quality: 75, mimeType: 'image/jpeg' },
        nextConfig,
        { silent: true },
      );
    } catch (err) {
      thrown = err;
    }

    // The concrete availability property I-215 cares about: this never
    // crashes, hangs, or throws an uncaught error for a decode-time failure.
    // If it DOES throw, it must be Next's own typed `ImageError` (a clean,
    // intentional 4xx signal), never a raw sharp/libvips exception escaping.
    if (thrown) {
      expect((thrown as ImageErrorType).constructor?.name).toBe('ImageError');
    } else {
      // MEASURED real behavior (see file docstring): falls back to serving
      // the original corrupt buffer verbatim, with the decode failure
      // recorded on `.error` for logging — not re-thrown, not turned into a
      // 4xx by this layer.
      expect(result!.buffer.equals(served)).toBe(true);
      expect(result!.contentType).toBe('image/jpeg');
      expect(result!.error).toBeInstanceOf(Error);
    }
  });

  it('a genuinely valid image round-trips through the real optimizer without the fallback path', async () => {
    const good = await sharp({ create: { width: 200, height: 150, channels: 3, background: { r: 20, g: 40, b: 60 } } })
      .jpeg()
      .toBuffer();
    const name = '01ARZ3NDEKTSV4RRFFQ69G5FA0.jpg';
    await fs.writeFile(path.join(absDir, name), good);

    const res = await get(name);
    const served = Buffer.from(await res.arrayBuffer());

    const result = await imageOptimizer(
      { buffer: served, contentType: null, cacheControl: null, etag: 'test-etag' },
      { href: `/uploads/${name}`, width: 100, quality: 75, mimeType: 'image/jpeg' },
      { experimental: {}, images: { dangerouslyAllowSVG: false, minimumCacheTTL: 60 } },
      { silent: true },
    );
    expect(result.error).toBeUndefined();
    expect(result.buffer.equals(served)).toBe(false); // genuinely re-encoded/resized, not just echoed back
    const meta = await sharp(result.buffer).metadata();
    expect(meta.width).toBe(100);
  });
});

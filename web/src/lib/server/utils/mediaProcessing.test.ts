// @vitest-environment node
/**
 * I-206/207/209 — proof that `reencodeUploadedImage` actually strips EXIF,
 * actually rejects a declared-huge-dimension "decompression bomb", and still
 * round-trips a normal image correctly. Fixtures are generated with `sharp`
 * itself (the same library under test) rather than checked in as binary
 * files — `sharp({ create: ... })` synthesizes a real, valid image with
 * exactly the properties each test needs.
 */
import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import {
  reencodeUploadedImage,
  ImageTooLargeError,
  ImageProcessingError,
  MAX_DIMENSION_PX,
  MAX_SERVE_DIMENSION_PX,
} from './mediaProcessing';
import { sniffImageExt } from './imageSniff';

/** A tiny real JPEG with an actual EXIF/IFD0 segment (Copyright/Software) —
 *  `sharp` only writes EXIF to its output when `.withMetadata()` is called
 *  with an `exif` block, which is exactly the case being guarded against:
 *  a client-controlled camera/phone photo carrying GPS/device metadata. */
async function jpegWithExif(): Promise<Buffer> {
  return sharp({ create: { width: 40, height: 30, channels: 3, background: { r: 200, g: 20, b: 20 } } })
    .withMetadata({ exif: { IFD0: { Copyright: 'ACME Corp', Software: 'ExifTestTool' } } })
    .jpeg()
    .toBuffer();
}

async function plainJpeg(width = 40, height = 30): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 10, g: 120, b: 200 } } })
    .jpeg()
    .toBuffer();
}

describe('reencodeUploadedImage — EXIF stripping (I-206)', () => {
  it('the fixture genuinely carries an EXIF segment before processing', async () => {
    const withExif = await jpegWithExif();
    const meta = await sharp(withExif).metadata();
    expect(meta.exif).toBeDefined();
  });

  it('strips EXIF from the re-encoded output entirely', async () => {
    const withExif = await jpegWithExif();
    const out = await reencodeUploadedImage(withExif, 'jpg');
    const meta = await sharp(out).metadata();
    expect(meta.exif).toBeUndefined();
    // Still a real, decodable JPEG with the same visible dimensions — this
    // isn't just truncating the file, it's a genuine re-encode.
    expect(sniffImageExt(out)).toBe('jpg');
    expect(meta.width).toBe(40);
    expect(meta.height).toBe(30);
  });
});

describe('reencodeUploadedImage — dimension cap / decompression bomb (I-207, I-209)', () => {
  it('rejects a declared-huge-dimension, small-on-disk image (classic decompression bomb) without hanging or crashing', async () => {
    // A single flat color compresses to a few hundred KB regardless of
    // declared size — small file, huge pixel count, the textbook bomb shape.
    const bomb = await sharp({
      create: { width: 8500, height: 8500, channels: 3, background: { r: 5, g: 5, b: 5 } },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();
    expect(bomb.length).toBeLessThan(2 * 1024 * 1024); // tiny file...
    await expect(reencodeUploadedImage(bomb, 'png')).rejects.toBeInstanceOf(ImageTooLargeError);
  });

  it('rejects an image whose declared dimensions merely exceed MAX_DIMENSION_PX, well under the pixel-count ceiling', async () => {
    // 8500 x 100 = 850,000px — far below MAX_INPUT_PIXELS (50,000,000) but
    // still over MAX_DIMENSION_PX on one axis, proving the dimension check
    // is a real, independent guard and not just a side effect of the pixel cap.
    const tall = await sharp({
      create: { width: MAX_DIMENSION_PX + 500, height: 100, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();
    await expect(reencodeUploadedImage(tall, 'png')).rejects.toBeInstanceOf(ImageTooLargeError);
  });

  it('accepts an image right at the boundary (and downscales it — see the serving-size describe block below)', async () => {
    const atLimit = await sharp({
      create: { width: MAX_DIMENSION_PX, height: 50, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();
    await expect(reencodeUploadedImage(atLimit, 'png')).resolves.toBeInstanceOf(Buffer);
  });
});

describe('reencodeUploadedImage — downscale to a sane serving size (I-209)', () => {
  it('downscales an accepted-but-large image to MAX_SERVE_DIMENSION_PX on its longest edge', async () => {
    const large = await sharp({
      create: { width: 4032, height: 3024, channels: 3, background: { r: 50, g: 60, b: 70 } }, // typical phone photo
    })
      .jpeg()
      .toBuffer();
    const out = await reencodeUploadedImage(large, 'jpg');
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(MAX_SERVE_DIMENSION_PX);
    // Aspect ratio preserved (fit: 'inside').
    expect(meta.height).toBe(Math.round((3024 / 4032) * MAX_SERVE_DIMENSION_PX));
  });

  it('never upscales a smaller-than-target image', async () => {
    const small = await sharp({ create: { width: 300, height: 200, channels: 3, background: { r: 1, g: 2, b: 3 } } })
      .jpeg()
      .toBuffer();
    const out = await reencodeUploadedImage(small, 'jpg');
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(300);
    expect(meta.height).toBe(200);
  });
});

describe('reencodeUploadedImage — corrupt/truncated input', () => {
  it('rejects a truncated JPEG cleanly instead of crashing or hanging', async () => {
    const good = await plainJpeg(200, 150);
    const truncated = good.subarray(0, Math.floor(good.length / 3));
    // Still sniffs as a JPEG (magic bytes only look at the header) — this is
    // exactly the gap I-215 raised: a header-valid, body-corrupt upload.
    expect(sniffImageExt(truncated)).toBe('jpg');
    await expect(reencodeUploadedImage(truncated, 'jpg')).rejects.toBeInstanceOf(ImageProcessingError);
  });
});

describe('reencodeUploadedImage — normal round trip', () => {
  it('a normal JPEG/PNG/WEBP still round-trips to a valid, similarly-sized image', async () => {
    for (const ext of ['jpg', 'png', 'webp'] as const) {
      const src = sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 30, g: 200, b: 30 } } });
      const buf = await (ext === 'jpg' ? src.jpeg() : ext === 'png' ? src.png() : src.webp()).toBuffer();
      const out = await reencodeUploadedImage(buf, ext);
      expect(sniffImageExt(out)).toBe(ext);
      const meta = await sharp(out).metadata();
      expect(meta.width).toBe(64);
      expect(meta.height).toBe(48);
    }
  });
});

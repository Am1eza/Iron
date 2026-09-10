/**
 * Server-side re-encode of an already magic-byte-sniffed upload (I-206/207/
 * 209 — see docs/audit-upload-media-I.md). Before this module existed, both
 * upload routes (`api/admin/upload`, `api/me/letterhead/logo`) wrote the
 * client's bytes to disk verbatim: no EXIF/GPS was ever stripped, and
 * nothing bounded the decoded pixel count of a file that had already passed
 * `sniffImageExt`'s 3/8/12-byte magic check.
 *
 * `sharp` (libvips) decodes once, under a hard pixel ceiling, then
 * re-encodes to a fresh file in the SAME format `sniffImageExt` already
 * determined — downscaled to a sane serving size along the way. Re-encoding
 * — not merely reading metadata and deciding pass/fail — is what actually
 * removes EXIF/ICC/XMP, because those are byte segments of the ORIGINAL
 * file's container; the only way to guarantee they are gone is to never copy
 * them into the output.
 */
import sharp from 'sharp';
import type { UploadImageExt } from './uploadStorage';

/**
 * Decoded-pixel-count ceiling passed straight to sharp's own
 * `limitInputPixels` — the constructor-level guard libvips uses to refuse to
 * even attempt decoding a file once its declared width×height crosses this,
 * so a "small file on disk, astronomical pixel count" decompression bomb
 * (I-207) throws instead of allocating an unbounded raw bitmap. 50,000,000px
 * is comfortably above any real product/article/letterhead photo (a few
 * megapixels) and comfortably below anything that would meaningfully dent
 * the 2GB `mem_limit` this app's web container runs under even decoded to
 * RGBA (50M × 4 bytes ≈ 200MB for one in-flight request).
 */
export const MAX_INPUT_PIXELS = 50_000_000;

/**
 * Reject a file whose *declared* width or height — read from its header via
 * `sharp(...).metadata()`, before the pixel-count guard above would even
 * matter — exceeds this (I-209). This also catches a merely-huge-but-real
 * image (a 600dpi A3 scan) that MAX_INPUT_PIXELS alone would still allow
 * through (8000×6000 is 48M px, under the ceiling above, but still far past
 * anything this site ever needs to serve at full resolution).
 */
export const MAX_DIMENSION_PX = 8000;

/**
 * Downscale target for the longest edge of every re-encoded image (I-209's
 * OTHER half — the accepted-but-oversized case, not just the reject case
 * above). Before this, an accepted image was written to disk at whatever
 * resolution the client sent, and SKU/category photos are served through a
 * raw `<img>` (no `next/image` in the loop — see `ProductImage.tsx`,
 * `CatalogManager.tsx`), so nothing downstream ever resized them either: a
 * 4000×3000 phone photo for a small catalog thumbnail shipped at full
 * resolution to every visitor, directly threatening this project's own
 * documented LCP budget (`LCP < 2.5s`, CLAUDE.md §6). 2400px comfortably
 * covers this site's largest real display size for a single product/article
 * image (never a full-bleed hero) while cutting a typical modern-phone photo
 * (main image dimension : ~4000-4032px) down to roughly a third of its
 * pixel count. `withoutEnlargement`: never upscales a smaller source.
 */
export const MAX_SERVE_DIMENSION_PX = 2400;

export class ImageTooLargeError extends Error {
  constructor(message = 'ابعاد تصویر بیش از حد مجاز است.') {
    super(message);
    this.name = 'ImageTooLargeError';
  }
}

/** Anything else sharp/libvips rejects the buffer for — truncated/corrupt
 *  bitstream, a pixel count over MAX_INPUT_PIXELS caught by libvips itself
 *  rather than the metadata() pre-check above, or any other decode failure.
 *  Deliberately one error type: the caller only needs "this was not a
 *  usable image", never sharp's internal reason. */
export class ImageProcessingError extends Error {
  constructor(message = 'پردازش تصویر ممکن نشد؛ فایل ممکن است خراب باشد.') {
    super(message);
    this.name = 'ImageProcessingError';
  }
}

function toImageError(err: unknown): Error {
  const message = err instanceof Error ? err.message : String(err);
  // libvips' own message for the constructor-level ceiling — treated the
  // same as our explicit metadata() dimension check below, since both mean
  // "this image is too big to serve", not "this file is corrupt".
  if (/exceeds pixel limit/i.test(message)) return new ImageTooLargeError();
  return new ImageProcessingError();
}

/**
 * Re-encode an uploaded image buffer whose format `sniffImageExt` already
 * confirmed via magic bytes. Returns a brand-new file: EXIF/ICC/XMP metadata
 * is NOT carried forward (sharp only preserves it when `.withMetadata()` is
 * called — this never calls it); `.rotate()` bakes any EXIF orientation into
 * the actual pixels first so a re-encoded portrait photo doesn't end up
 * sideways once the orientation tag that used to describe it is gone; and
 * the result is downscaled to fit within `MAX_SERVE_DIMENSION_PX` on its
 * longest edge (never upscaled) before encoding.
 *
 * Throws `ImageTooLargeError` for a declared width/height over
 * `MAX_DIMENSION_PX` — a hard reject, not a downscale, because a file THAT
 * large is treated as a bomb/abuse signal, not a legitimate oversized photo
 * — or `ImageProcessingError` for anything sharp cannot decode at all
 * (truncated upload, a pixel count over `MAX_INPUT_PIXELS`, any other
 * libvips decode failure) — callers turn both into a clean 4xx, never a 500
 * or a hang.
 */
export async function reencodeUploadedImage(buf: Buffer, ext: UploadImageExt): Promise<Buffer> {
  // `pages: 1`: only the first frame of an animated WEBP is decoded — this
  // site never needs an animated upload, and per-frame decoding is exactly
  // the kind of multiplier a dimension-only check below would miss entirely.
  const img = sharp(buf, { limitInputPixels: MAX_INPUT_PIXELS, pages: 1, failOn: 'truncated' });

  let meta;
  try {
    meta = await img.metadata();
  } catch (err) {
    throw toImageError(err);
  }
  if ((meta.width ?? 0) > MAX_DIMENSION_PX || (meta.height ?? 0) > MAX_DIMENSION_PX) {
    throw new ImageTooLargeError();
  }

  try {
    const resized = img
      .rotate()
      .resize({
        width: MAX_SERVE_DIMENSION_PX,
        height: MAX_SERVE_DIMENSION_PX,
        fit: 'inside',
        withoutEnlargement: true,
      });
    const encoded =
      ext === 'jpg'
        ? resized.jpeg({ quality: 90, mozjpeg: true })
        : ext === 'png'
          ? resized.png()
          : resized.webp({ quality: 90 });
    return await encoded.toBuffer();
  } catch (err) {
    throw toImageError(err);
  }
}

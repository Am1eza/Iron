/**
 * Real (magic-byte) image sniffing — a client can set `file.type`/the
 * filename extension to anything, so trusting either would let an uploaded
 * `.jpg` actually be an HTML/SVG/script payload served back from `public/`.
 * Only the three formats this app's `next.config.mjs` optimizes for are
 * accepted (`images.formats`). Kept out of the upload route.ts file: Next's
 * App Router only recognizes a restricted export surface (GET/POST/...,
 * `runtime`, `dynamic`, ...) from an actual `route.ts` — `next build`
 * type-checks this and fails on any other named export.
 */
export function sniffImageExt(buf: Buffer): 'jpg' | 'png' | 'webp' | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  )
    return 'png';
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  )
    return 'webp';
  return null;
}

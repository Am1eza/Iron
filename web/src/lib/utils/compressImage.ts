/**
 * Client-side downscale + WebP re-encode before an admin image upload
 * leaves the browser. Uploads on this deployment sometimes cross an
 * unreliable connection for many seconds before dropping mid-transfer
 * (real, observed failure — not hypothetical); the fix that actually
 * addresses that is sending fewer bytes in the first place; a server-side
 * conversion can't help, since the original still has to survive the
 * upload before any server-side step ever runs.
 *
 * Defensive by construction: any failure (canvas unavailable, WebP
 * encoding unsupported, the "compressed" result coming out larger than the
 * original — a already-tiny/already-optimized source) falls back to the
 * original `file` untouched, never blocks the upload.
 */

const MAX_DIMENSION = 1920;
const QUALITY = 0.82;

export async function compressImageForUpload(file: File): Promise<File> {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return file;
  try {
    const bitmap = await createImageBitmap(file);
    try {
      const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return file;
      ctx.drawImage(bitmap, 0, 0, width, height);

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', QUALITY));
      if (!blob || blob.size >= file.size) return file;

      const name = file.name.replace(/\.[^./\\]+$/, '') + '.webp';
      return new File([blob], name, { type: 'image/webp' });
    } finally {
      bitmap.close();
    }
  } catch {
    // Any failure here (decode error, WebP unsupported, ...) — upload the
    // original rather than block on a nice-to-have.
    return file;
  }
}

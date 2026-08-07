import path from 'path';

/** Shared between the upload route (write) and the serving route (read) —
 *  both must resolve the exact same directory, or a change to `UPLOAD_DIR`
 *  silently splits writes from reads. */
export function uploadDir(): string {
  return path.join(process.cwd(), process.env.UPLOAD_DIR ?? 'public/uploads');
}

/** The exact shape `${ulid()}.${ext}` produces (`upload/route.ts`) — 26
 *  Crockford-base32 chars, one of the three formats `sniffImageExt` accepts.
 *  Anything else (path traversal, a different extension, a bare `..`) is
 *  rejected outright rather than touching the filesystem with it. */
export const UPLOAD_FILENAME_RE = /^[0-9A-HJKMNP-TV-Z]{26}\.(jpg|png|webp)$/;

export const MIME_FOR_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

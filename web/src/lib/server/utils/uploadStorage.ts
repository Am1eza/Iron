import path from 'path';
import { getCloudflareContext } from '@opennextjs/cloudflare';

/** I-214 — `true` only when actually executing on Cloudflare Workers. Same
 *  probe as rateLimit.ts's `onCloudflareWorkers`: `getCloudflareContext()`
 *  throws outside a Worker. Workers has no persistent filesystem — a V8
 *  isolate, not a container — so `fs.writeFile`/`fs.readFile` against
 *  `uploadDir()` either throws outright or (depending on the exact runtime
 *  polyfill) silently lands in a virtual filesystem that evaporates on the
 *  next cold start. Neither failure mode is Workers-specific error text an
 *  operator would recognize as "uploads aren't supported here" — see
 *  docs/audit-upload-media-I.md's I-214 for the full reasoning. */
function onCloudflareWorkers(): boolean {
  try {
    return Boolean(getCloudflareContext()?.env);
  } catch {
    return false;
  }
}

/** Shared between the upload route (write) and the serving route (read) —
 *  both must resolve the exact same directory, or a change to `UPLOAD_DIR`
 *  silently splits writes from reads.
 *
 *  `turbopackIgnore`: `UPLOAD_DIR` being an env var (not a static literal)
 *  makes Turbopack's build-time tracer conservatively bundle the ENTIRE
 *  project — including `public/` — into the standalone server output,
 *  since it can't prove the write stays inside a bounded subfolder. It
 *  does; this is always either `public/uploads` or an operator-configured
 *  sibling of it, never used to escape `cwd()`.
 *
 *  I-214: throws a clear, specific error on Workers instead of letting the
 *  caller's `fs.writeFile`/`fs.readFile` fail with a generic filesystem
 *  error (or silently write to a filesystem that won't survive the next
 *  cold start) — the Docker/Node deploy is this feature's only supported
 *  target (CLAUDE.md: "hosting: hybrid... app+DB inside Iran"; the
 *  secondary Workers target has no R2/KV binding for uploads, see
 *  wrangler.jsonc). This is deliberately just a clear failure, not a
 *  polyfill or an R2 backend — building one speculatively for a target
 *  this feature has never run on would be solving a problem nobody has
 *  yet, not closing a real gap. */
export function uploadDir(): string {
  if (onCloudflareWorkers()) {
    throw new Error(
      'Uploads are not supported on the Cloudflare Workers target: there is no persistent ' +
        'filesystem (and no R2/KV binding configured for it). See docs/audit-upload-media-I.md#I-214.',
    );
  }
  return path.join(/*turbopackIgnore: true*/ process.cwd(), process.env.UPLOAD_DIR ?? 'public/uploads');
}

/** The exact shape `${ulid()}.${ext}` produces (`upload/route.ts`) — 26
 *  Crockford-base32 chars, one of the three formats `sniffImageExt` accepts.
 *  Anything else (path traversal, a different extension, a bare `..`) is
 *  rejected outright rather than touching the filesystem with it. */
export const UPLOAD_FILENAME_RE = /^[0-9A-HJKMNP-TV-Z]{26}\.(jpg|png|webp)$/;

/** A stricter version of the same pattern, anchored to a `/uploads/` URL path
 *  rather than a bare filename — used wherever a stored DB value (`imageUrl`,
 *  `coverUrl`, an inline article-body image `src`, `letterheadLogoUrl`) needs
 *  to be turned back into the on-disk filename it names, e.g. to delete it
 *  (see `uploadCleanup.ts`). Capture group 1 is the filename alone. */
export const UPLOAD_URL_RE = /^\/uploads\/([0-9A-HJKMNP-TV-Z]{26}\.(?:jpg|png|webp))$/;

export type UploadImageExt = 'jpg' | 'png' | 'webp';

export const MIME_FOR_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

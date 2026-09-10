/**
 * I-212 — uploaded-file lifecycle. Two things live here:
 *
 *  1. `referencedUploadFilenames()` — every filename under `uploadDir()` any
 *     LIVE row in the database still points at. This has to be a superset of
 *     every real reference or the periodic reconciliation job in
 *     `cleanup.job.ts` deletes a file a customer can still see. It is NOT
 *     just `skus.image_url`/`categories.image_url`/`articles.cover_url`:
 *       - `categories.seo`/`articles.seo` carry an independent `ogImage`
 *         (see `validation/utils.ts#seoMetaSchema`) that an admin can point
 *         at an upload separately from the cover/thumbnail field.
 *       - `articles.body_json` — the rich-text editor lets a writer
 *         paste/drop an image directly into an article's BODY (see
 *         `RichTextEditor.tsx`), which is a `richDoc` `image` node nowhere
 *         near `coverUrl`. Missing this would make the reconciliation job
 *         delete live in-article pictures.
 *       - `club_memberships.letterhead_logo_url` — the پولادی customer's
 *         proforma logo.
 *
 *  2. `deleteOrphanedUploadIfUnused()` — best-effort immediate delete for the
 *     three "replace this file" call sites (SKU/category image swap, SKU/
 *     category/article delete, letterhead logo swap). It re-checks the SAME
 *     live-reference set before unlinking, so it is safe even in the
 *     (currently theoretical — nothing in this codebase creates it) case of
 *     two rows manually pointed at the identical uploaded filename: a delete
 *     of one row never removes a file the other still needs. Never throws —
 *     a failed unlink is logged and swallowed, exactly like every other
 *     best-effort cleanup in this codebase (see `redirectArticleUrl` in
 *     `articles/[id]/route.ts` for the same pattern).
 */
import { promises as fs } from 'fs';
import path from 'path';
import { getDb } from '@/lib/server/db/client';
import { articles, categories, clubMemberships, skus } from '@/lib/server/db/schema';
import { reportError } from '@/lib/errors/report';
import { uploadDir, UPLOAD_URL_RE } from './uploadStorage';

/** `null`/`undefined`/anything not shaped like a real upload URL (an
 *  external link, a relative path elsewhere) all resolve to `null` — nothing
 *  outside `/uploads/<ulid>.<ext>` is ever a candidate for deletion here. */
function filenameFromUploadUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const match = UPLOAD_URL_RE.exec(url);
  return match ? match[1]! : null;
}

/** Recursively walk a `richDoc` JSON tree (or any plain JSON value) looking
 *  for `{ type: 'image', attrs: { src } }` nodes, collecting every one whose
 *  `src` is a same-origin `/uploads/...` path. Deliberately untyped/duck-
 *  typed rather than importing `RichDoc`'s zod schema: this only ever reads
 *  already-validated rows out of the database, so it must tolerate a shape
 *  that predates a later schema change rather than throw. */
function collectBodyImageFilenames(node: unknown, out: Set<string>): void {
  if (Array.isArray(node)) {
    for (const child of node) collectBodyImageFilenames(child, out);
    return;
  }
  if (!node || typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;
  if (obj.type === 'image' && obj.attrs && typeof obj.attrs === 'object') {
    const fn = filenameFromUploadUrl((obj.attrs as Record<string, unknown>).src);
    if (fn) out.add(fn);
  }
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object') collectBodyImageFilenames(value, out);
  }
}

/** See the module docstring — the authoritative "still in use" set. */
export async function referencedUploadFilenames(): Promise<Set<string>> {
  const db = getDb();
  const out = new Set<string>();

  const [cats, skuRows, arts, logos] = await Promise.all([
    db.select({ imageUrl: categories.imageUrl, seo: categories.seo }).from(categories),
    db.select({ imageUrl: skus.imageUrl }).from(skus),
    db.select({ coverUrl: articles.coverUrl, seo: articles.seo, bodyJson: articles.bodyJson }).from(articles),
    db.select({ logoUrl: clubMemberships.letterheadLogoUrl }).from(clubMemberships),
  ]);

  for (const c of cats) {
    const fn = filenameFromUploadUrl(c.imageUrl);
    if (fn) out.add(fn);
    const og = filenameFromUploadUrl((c.seo as { ogImage?: string } | null)?.ogImage);
    if (og) out.add(og);
  }
  for (const s of skuRows) {
    const fn = filenameFromUploadUrl(s.imageUrl);
    if (fn) out.add(fn);
  }
  for (const a of arts) {
    const fn = filenameFromUploadUrl(a.coverUrl);
    if (fn) out.add(fn);
    const og = filenameFromUploadUrl((a.seo as { ogImage?: string } | null)?.ogImage);
    if (og) out.add(og);
    if (a.bodyJson) collectBodyImageFilenames(a.bodyJson, out);
  }
  for (const l of logos) {
    const fn = filenameFromUploadUrl(l.logoUrl);
    if (fn) out.add(fn);
  }

  return out;
}

/**
 * Delete the file an `/uploads/...` URL names, but ONLY if no other live row
 * references it — re-runs `referencedUploadFilenames()` first. Call this
 * with the OLD value right after a delete/replace has already committed
 * (the row's own reference is gone from the DB by the time this reads it).
 * Best-effort: a missing file is not an error, and any other failure is
 * logged, never thrown — this must never block or fail the caller's delete.
 */
export async function deleteOrphanedUploadIfUnused(url: string | null | undefined): Promise<void> {
  await deleteOrphanedUploadsIfUnused([url]);
}

/**
 * Same as `deleteOrphanedUploadIfUnused`, but for many candidate URLs at
 * once (a category-cascade delete can take dozens of SKU images with it) —
 * computes `referencedUploadFilenames()` exactly ONCE for the whole batch
 * instead of once per file.
 */
export async function deleteOrphanedUploadsIfUnused(urls: (string | null | undefined)[]): Promise<void> {
  const filenames = [...new Set(urls.map(filenameFromUploadUrl).filter((f): f is string => f !== null))];
  if (filenames.length === 0) return;
  const inUse = await referencedUploadFilenames();
  const dir = uploadDir();
  await Promise.all(
    filenames
      .filter((f) => !inUse.has(f))
      .map(async (filename) => {
        try {
          await fs.unlink(path.join(dir, filename));
        } catch (err) {
          if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return;
          reportError(err, { stage: 'uploads.deleteOrphanedUploadsIfUnused', filename });
        }
      }),
  );
}

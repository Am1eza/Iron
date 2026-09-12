/**
 * I-201 (docs/audit-upload-media-I.md) — architectural-invariant test, same
 * shape as `adminApiConventions.test.ts`'s G-155/G-162/G-170 checks: this
 * doesn't test BEHAVIOR (that's `imageSniff.test.ts` and each route's own
 * `route.test.ts`), it tests that every route sharing the upload-storage
 * pipeline still follows the convention its two existing siblings do, so a
 * THIRD upload route added later can't silently skip it.
 *
 * The audit's own words: "بدون یک gate ساختاری، یک توسعه‌دهندهٔ آینده
 * می‌تواند یک اندپوینت آپلود سوم اضافه کند که فایل را مستقیماً بر اساس
 * Content-Type هدر ذخیره می‌کند و هیچ تستی این را نمی‌گیرد."
 *
 * Scope, deliberately narrow: routes that call `writeUploadFile` — the ONLY
 * function in this codebase that writes bytes into `uploadDir()`, later
 * served back by `app/uploads/[filename]/route.ts` with a Content-Type
 * trusted purely from the filename's extension (`MIME_FOR_EXT`, keyed by
 * `UPLOAD_FILENAME_RE`'s `.(jpg|png|webp)` group — see I-211). A route
 * reaching `writeUploadFile` without having sniffed the real bytes first
 * could store an arbitrary file under an image extension, and it would be
 * served back with an image Content-Type.
 *
 * This deliberately does NOT flag every route that merely reads
 * `formData()`/a `'file'` field — a legitimate non-image file upload (e.g.
 * `api/admin/pricing/import`'s `.xlsx` importer) never touches
 * `writeUploadFile` at all and has its own format validation (`ExcelJS`
 * throws on a non-xlsx buffer); flagging it here would be noise the audit
 * explicitly warned against ("Keep it narrowly scoped to actual upload
 * routes, not every route").
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function walk(dir: string): string[] {
  const abs = path.join(ROOT, dir);
  let entries: string[];
  try {
    entries = readdirSync(abs);
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const rel = path.join(dir, entry);
    const full = path.join(ROOT, rel);
    if (statSync(full).isDirectory()) files.push(...walk(rel));
    else if (entry === 'route.ts') files.push(rel);
  }
  return files;
}

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), 'utf8');
}

const ALL_ROUTES = walk('src/app');
const WRITES_TO_UPLOAD_STORAGE = ALL_ROUTES.filter((rel) => /\bwriteUploadFile\(/.test(read(rel)));

describe('I-201 — every route writing into the shared upload storage sniffs real image bytes first', () => {
  it.each(WRITES_TO_UPLOAD_STORAGE)('%s calls sniffImageExt before writeUploadFile', (rel) => {
    const src = read(rel);
    expect(
      src.includes('sniffImageExt'),
      `${rel} calls writeUploadFile() without importing/calling sniffImageExt() — it could ` +
        `store a file whose real bytes were never checked against the JPEG/PNG/WEBP magic-byte ` +
        `allowlist, and app/uploads/[filename]/route.ts serves it back with a Content-Type ` +
        `trusted purely from that file's extension (see docs/audit-upload-media-I.md#I-201, #I-211).`,
    ).toBe(true);
  });

  it('found the two known upload routes (catches the filter silently matching nothing, e.g. after a writeUploadFile rename)', () => {
    expect(WRITES_TO_UPLOAD_STORAGE.length).toBeGreaterThanOrEqual(2);
  });
});

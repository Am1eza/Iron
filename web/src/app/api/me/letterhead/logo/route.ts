import { readFormBody } from '@/lib/server/utils/requestBody';
import { promises as fs } from 'fs';
import { NextResponse, type NextRequest } from 'next/server';
import { getSessionVerified } from '@/lib/auth/session';
import { assertSameOrigin } from '@/lib/auth/origin';
import { requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { clubStatus, getLetterhead, setLetterhead } from '@/lib/server/repos/clubRepo';
import { rateLimit } from '@/lib/server/utils/rateLimit';
import { sniffImageExt } from '@/lib/server/utils/imageSniff';
import { uploadDir, writeUploadFile } from '@/lib/server/utils/uploadStorage';
import { reencodeUploadedImage, ImageTooLargeError } from '@/lib/server/utils/mediaProcessing';
import { deleteOrphanedUploadIfUnused } from '@/lib/server/utils/uploadCleanup';

export const runtime = 'nodejs';

const MAX_BYTES = 5 * 1024 * 1024; // same cap as admin/upload

/**
 * POST /api/me/letterhead/logo — پولادی-tier customer-facing image upload,
 * separate from /api/admin/upload (that one requires a staff permission this
 * caller doesn't and shouldn't have) but writing through the SAME storage
 * (`uploadDir`, magic-byte sniff, ULID filename, served by
 * app/uploads/[filename]/route.ts) so there is exactly one place a file on
 * disk can come from.
 *
 * The saved logo is served back WITHOUT auth (see app/uploads/[filename]/
 * route.ts's docstring, I-210) — intentional: it is embedded on the public-
 * capability `/proforma/[ref]` page, which a customer forwards to third
 * parties by design.
 */
async function POSTImpl(req: NextRequest) {
  const origin = assertSameOrigin(req);
  if (origin) return origin;
  const guard = requireDb();
  if (guard) return guard;
  const session = await getSessionVerified();
  if (!session) {
    return NextResponse.json(
      { error: 'unauthenticated', message: 'وارد نشده‌اید.' },
      { status: 401 },
    );
  }
  const status = await clubStatus(session.id);
  if (status.tier !== 'poolad') {
    return NextResponse.json({ error: 'not_found', message: 'یافت نشد.' }, { status: 404 });
  }
  // A member sets their logo rarely — far tighter than the 30/min editorial
  // rate on the admin route, which uploads many files a day by design.
  const limited = await rateLimit(req, 'upload', { limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  const form = await readFormBody(req);
  const file = form?.get('file');
  if (!file || typeof file === 'string') {
    return NextResponse.json(
      { error: 'no_file', message: 'فایلی ارسال نشده است.' },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: 'too_large', message: 'حجم فایل حداکثر ۵ مگابایت.' },
      { status: 400 },
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const ext = sniffImageExt(buf);
  if (!ext) {
    return NextResponse.json(
      { error: 'bad_file', message: 'فرمت فایل پشتیبانی نمی‌شود؛ فقط JPG، PNG یا WebP مجاز است.' },
      { status: 400 },
    );
  }

  // Same server-side re-encode as /api/admin/upload — strips EXIF/GPS (this
  // is a customer's own photo/scan, the highest-privacy asset this pipeline
  // handles — see docs/audit-upload-media-I.md#I-206), and rejects an
  // oversized/corrupt file cleanly before it ever reaches disk.
  let processed: Buffer;
  try {
    processed = await reencodeUploadedImage(buf, ext);
  } catch (err) {
    if (err instanceof ImageTooLargeError) {
      return NextResponse.json({ error: 'image_too_large', message: err.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: 'bad_file', message: 'پردازش تصویر ممکن نشد؛ فایل ممکن است خراب باشد.' },
      { status: 400 },
    );
  }

  // Read the OLD logo before overwriting it — a replace must not leave the
  // previous file behind forever (I-212).
  const previous = await getLetterhead(session.id);

  const dir = uploadDir();
  await fs.mkdir(dir, { recursive: true });
  const filename = await writeUploadFile(dir, ext, processed);

  const url = `/uploads/${filename}`;
  const ok = await setLetterhead(session.id, { logoUrl: url });
  if (!ok) {
    return NextResponse.json(
      { error: 'no_membership', message: 'عضویت باشگاه یافت نشد.' },
      { status: 409 },
    );
  }

  // Best-effort — never lets a disk failure turn a successful logo swap into
  // an error response; see uploadCleanup.ts's docstring.
  if (previous?.logoUrl && previous.logoUrl !== url) {
    await deleteOrphanedUploadIfUnused(previous.logoUrl);
  }

  return NextResponse.json({ url }, { status: 201 });
}

export const POST = withApiErrorHandling(POSTImpl);

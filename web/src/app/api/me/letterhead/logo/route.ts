import { promises as fs } from 'fs';
import path from 'path';
import { NextResponse, type NextRequest } from 'next/server';
import { ulid } from 'ulid';
import { getSessionVerified } from '@/lib/auth/session';
import { assertSameOrigin } from '@/lib/auth/origin';
import { requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { clubStatus, setLetterhead } from '@/lib/server/repos/clubRepo';
import { rateLimit } from '@/lib/server/utils/rateLimit';
import { sniffImageExt } from '@/lib/server/utils/imageSniff';
import { uploadDir } from '@/lib/server/utils/uploadStorage';

export const runtime = 'nodejs';

const MAX_BYTES = 5 * 1024 * 1024; // same cap as admin/upload

/**
 * POST /api/me/letterhead/logo — پولادی-tier customer-facing image upload,
 * separate from /api/admin/upload (that one requires a staff permission this
 * caller doesn't and shouldn't have) but writing through the SAME storage
 * (`uploadDir`, magic-byte sniff, ULID filename, served by
 * app/uploads/[filename]/route.ts) so there is exactly one place a file on
 * disk can come from.
 */
async function POSTImpl(req: NextRequest) {
  const origin = assertSameOrigin(req);
  if (origin) return origin;
  const guard = requireDb();
  if (guard) return guard;
  const session = await getSessionVerified();
  if (!session) {
    return NextResponse.json({ error: 'unauthenticated', message: 'وارد نشده‌اید.' }, { status: 401 });
  }
  const status = await clubStatus(session.id);
  if (status.tier !== 'poolad') {
    return NextResponse.json({ error: 'not_found', message: 'یافت نشد.' }, { status: 404 });
  }
  // A member sets their logo rarely — far tighter than the 30/min editorial
  // rate on the admin route, which uploads many files a day by design.
  const limited = await rateLimit(req, 'upload', { limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'no_file', message: 'فایلی ارسال نشده است.' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'too_large', message: 'حجم فایل حداکثر ۵ مگابایت.' }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const ext = sniffImageExt(buf);
  if (!ext) {
    return NextResponse.json(
      { error: 'bad_file', message: 'فرمت فایل پشتیبانی نمی‌شود — فقط JPG، PNG یا WebP مجاز است.' },
      { status: 400 },
    );
  }

  const filename = `${ulid()}.${ext}`;
  const dir = uploadDir();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, filename), buf);

  const url = `/uploads/${filename}`;
  const ok = await setLetterhead(session.id, { logoUrl: url });
  if (!ok) {
    return NextResponse.json({ error: 'no_membership', message: 'عضویت باشگاه یافت نشد.' }, { status: 409 });
  }

  return NextResponse.json({ url }, { status: 201 });
}

export const POST = withApiErrorHandling(POSTImpl);

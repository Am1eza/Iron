import { readFormBody } from '@/lib/server/utils/requestBody';
import { promises as fs } from 'fs';
import { NextResponse, type NextRequest } from 'next/server';
import { can } from '@/lib/auth/roles';
import {
  requireApiUser,
  requireDb,
  withApiErrorHandling,
  audit,
} from '@/lib/server/utils/apiGuard';
import { rateLimit } from '@/lib/server/utils/rateLimit';
import { sniffImageExt } from '@/lib/server/utils/imageSniff';
import { uploadDir, writeUploadFile } from '@/lib/server/utils/uploadStorage';
import { reencodeUploadedImage, ImageTooLargeError } from '@/lib/server/utils/mediaProcessing';

export const runtime = 'nodejs';

const MAX_BYTES = 5 * 1024 * 1024; // 5MB — same cap as admin/pricing/import.

/**
 * POST /api/admin/upload — shared image upload for the admin panel (article
 * cover, SKU photo, ...). Content editors AND catalog managers both need this,
 * so unlike most admin routes it checks either of two permissions rather than
 * one (`requireApiPermission` only takes a single permission).
 * 404s (not 403) for unauthorized roles — same hide-don't-reveal convention
 * as every other admin route (see apiGuard.ts).
 */
async function POSTImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiUser(req, { strict: true });
  if ('response' in auth) return auth.response;
  const { session } = auth;
  if (!can(session.role, 'content:write') && !can(session.role, 'catalog:write')) {
    return NextResponse.json({ error: 'not_found', message: 'یافت نشد.' }, { status: 404 });
  }
  // Auth and validation were already right; what was missing was any bound on
  // HOW MANY times a legitimate (or compromised) holder may call this. Uploads
  // land in a Docker volume on the same host as Postgres, at 5 MB a call, with
  // no orphan cleanup. 30/min is far above real editorial use.
  const limited = await rateLimit(req, 'upload', { limit: 30, windowMs: 60_000 });
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
      { error: 'bad_file', message: 'فرمت فایل پشتیبانی نمی‌شود — فقط JPG، PNG یا WebP مجاز است.' },
      { status: 400 },
    );
  }

  // Re-encode server-side before anything touches disk (I-206/207/209):
  // strips EXIF/GPS/ICC (sharp never preserves it unless `.withMetadata()`
  // is called, which this never does), rejects a declared-huge-dimension
  // decompression bomb, and rejects a truncated/corrupt upload cleanly
  // instead of storing bytes that would only fail later at serve time.
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

  // Never trust the client-supplied filename (path traversal, collisions) —
  // the on-disk name is entirely server-generated.
  const dir = uploadDir();
  await fs.mkdir(dir, { recursive: true });
  const filename = await writeUploadFile(dir, ext, processed);

  // Served back by app/uploads/[filename]/route.ts, NOT Next's static
  // public/ handling — see that file for why a runtime-written file can't
  // rely on the framework's own public-asset serving.
  const url = `/uploads/${filename}`;
  await audit(session.id, 'media.upload', { type: 'media', id: filename }, undefined, {
    url,
    size: processed.length,
    ext,
  });

  return NextResponse.json({ url }, { status: 201 });
}

export const POST = withApiErrorHandling(POSTImpl);

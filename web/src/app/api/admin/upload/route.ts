import { promises as fs } from 'fs';
import path from 'path';
import { NextResponse, type NextRequest } from 'next/server';
import { ulid } from 'ulid';
import { can } from '@/lib/auth/roles';
import { requireApiUser, requireDb, withApiErrorHandling, audit } from '@/lib/server/utils/apiGuard';
import { rateLimit } from '@/lib/server/utils/rateLimit';
import { sniffImageExt } from '@/lib/server/utils/imageSniff';
import { uploadDir } from '@/lib/server/utils/uploadStorage';

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

  // Never trust the client-supplied filename (path traversal, collisions) —
  // the on-disk name is entirely server-generated.
  const filename = `${ulid()}.${ext}`;
  const dir = uploadDir();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, filename), buf);

  // Served back by app/uploads/[filename]/route.ts, NOT Next's static
  // public/ handling — see that file for why a runtime-written file can't
  // rely on the framework's own public-asset serving.
  const url = `/uploads/${filename}`;
  await audit(session.id, 'media.upload', { type: 'media', id: filename }, undefined, {
    url,
    size: file.size,
    ext,
  });

  return NextResponse.json({ url }, { status: 201 });
}

export const POST = withApiErrorHandling(POSTImpl);

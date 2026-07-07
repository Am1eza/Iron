import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { addToAllowlist, listAllowlist } from '@/lib/server/repos/adminAllowlistRepo';
import { revokeAllForUser } from '@/lib/auth/store';
import { normalizeDigits } from '@/lib/utils/format';

/** GET /api/admin/allowlist — who may hold the admin role (joined with users). */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'users:manage');
  if ('response' in auth) return auth.response;
  return NextResponse.json({ entries: await listAllowlist() });
}

const payload = z.object({
  mobile: z
    .string()
    .trim()
    .transform((s) => normalizeDigits(s))
    .pipe(z.string().regex(/^09\d{9}$/, 'شمارهٔ موبایل معتبر نیست (۰۹xxxxxxxxx).')),
  label: z.string().trim().max(60).optional(),
});

/** POST /api/admin/allowlist — add an admin mobile (promotes on the spot if
 *  the user already exists; otherwise their first OTP login promotes them). */
async function POSTImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'users:manage');
  if ('response' in auth) return auth.response;
  const v = await validateBody(req, payload);
  if (!v.ok) return v.response;

  const { promotedUserId } = await addToAllowlist(v.data.mobile, v.data.label ?? null, auth.session.id);
  // A promotion invalidates the target's existing sessions so their NEXT
  // request carries the admin role via a fresh login/refresh, not a stale JWT.
  if (promotedUserId) await revokeAllForUser(promotedUserId);
  await audit(
    auth.session.id,
    'admin_allowlist.add',
    { type: 'admin_allowlist', id: v.data.mobile },
    undefined,
    { mobile: v.data.mobile, label: v.data.label ?? null, promotedUserId },
  );
  return NextResponse.json({ entries: await listAllowlist() }, { status: 201 });
}

export const GET = withApiErrorHandling(GETImpl);
export const POST = withApiErrorHandling(POSTImpl);

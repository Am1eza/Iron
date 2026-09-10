import { NextResponse, type NextRequest } from 'next/server';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { allowlistedRole, removeFromAllowlist } from '@/lib/server/repos/adminAllowlistRepo';
import { revokeAllForUser } from '@/lib/auth/store';
import { normalizeDigits } from '@/lib/utils/format';
import { getDb } from '@/lib/server/db/client';

/** DELETE /api/admin/allowlist/{mobile} — remove an admin mobile.
 *  Safeguards: you cannot remove yourself, and you cannot remove the last
 *  entry (lock-out guard). The removed mobile's user is demoted immediately
 *  and their sessions revoked — fail-closed, no lingering admin JWT. */
async function DELETEImpl(req: NextRequest, ctx: { params: Promise<{ mobile: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'users:manage');
  if ('response' in auth) return auth.response;
  const { mobile: raw } = await ctx.params;
  const mobile = normalizeDigits(decodeURIComponent(raw));
  if (!/^09\d{9}$/.test(mobile)) {
    return NextResponse.json({ error: 'invalid_mobile', message: 'شمارهٔ موبایل معتبر نیست.' }, { status: 400 });
  }

  if (mobile === auth.session.mobile) {
    return NextResponse.json(
      { error: 'self_removal', message: 'نمی‌توانید خودتان را از فهرست مدیران حذف کنید.' },
      { status: 409 },
    );
  }
  const grantedRole = await allowlistedRole(mobile);
  if (!grantedRole) {
    return NextResponse.json({ error: 'not_found', message: 'این شماره در فهرست نیست.' }, { status: 404 });
  }
  // The last-admin lock-out guard is enforced INSIDE removeFromAllowlist,
  // under a row lock that serializes against any concurrent grant/removal
  // (G-159 follow-up: an unlocked pre-check here let two concurrent removals
  // of two DIFFERENT admins each observe "2 admins, safe" and both proceed,
  // zeroing the registry — see lockAdminRowsAndTarget in adminAllowlistRepo.ts).

  // Same atomicity guarantee as the grant path (G-160): registry removal,
  // the target's role reset, and the audit row commit as one unit.
  const { demotedUserId } = await getDb().transaction(async (tx) => {
    const result = await removeFromAllowlist(mobile, tx);
    await audit(
      auth.session.id,
      'admin_allowlist.remove',
      { type: 'admin_allowlist', id: mobile },
      { mobile },
      { demotedUserId: result.demotedUserId },
      tx,
    );
    return result;
  });
  if (demotedUserId) await revokeAllForUser(demotedUserId);
  return NextResponse.json({ ok: true });
}

export const DELETE = withApiErrorHandling(DELETEImpl);

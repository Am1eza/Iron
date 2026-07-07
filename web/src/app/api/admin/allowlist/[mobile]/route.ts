import { NextResponse, type NextRequest } from 'next/server';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { allowlistCount, isAllowlisted, removeFromAllowlist } from '@/lib/server/repos/adminAllowlistRepo';
import { revokeAllForUser } from '@/lib/auth/store';
import { normalizeDigits } from '@/lib/utils/format';

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
  if (!(await isAllowlisted(mobile))) {
    return NextResponse.json({ error: 'not_found', message: 'این شماره در فهرست نیست.' }, { status: 404 });
  }
  if ((await allowlistCount()) <= 1) {
    return NextResponse.json(
      { error: 'last_admin', message: 'آخرین مدیر را نمی‌توان حذف کرد.' },
      { status: 409 },
    );
  }

  const { demotedUserId } = await removeFromAllowlist(mobile);
  if (demotedUserId) await revokeAllForUser(demotedUserId);
  await audit(
    auth.session.id,
    'admin_allowlist.remove',
    { type: 'admin_allowlist', id: mobile },
    { mobile },
    { demotedUserId },
  );
  return NextResponse.json({ ok: true });
}

export const DELETE = withApiErrorHandling(DELETEImpl);

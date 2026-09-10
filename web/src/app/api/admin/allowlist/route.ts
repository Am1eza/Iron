import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { addToAllowlist, listAllowlist } from '@/lib/server/repos/adminAllowlistRepo';
import { revokeAllForUser } from '@/lib/auth/store';
import { normalizeDigits } from '@/lib/utils/format';
import { getDb } from '@/lib/server/db/client';

/** GET /api/admin/allowlist — who may hold the admin role (joined with users). */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'users:manage');
  if ('response' in auth) return auth.response;
  return NextResponse.json({ entries: await listAllowlist() }, { headers: { 'Cache-Control': 'no-store' } });
}

const payload = z.object({
  mobile: z
    .string()
    .trim()
    // H-173: bounds the input BEFORE it reaches transform()/normalizeDigits —
    // the .regex() below only constrains the value AFTER the pipe, so an
    // unbounded string still reaches .trim()/transform() first without this.
    .max(20)
    .transform((s) => normalizeDigits(s))
    .pipe(z.string().regex(/^09\d{9}$/, 'شمارهٔ موبایل معتبر نیست (۰۹xxxxxxxxx).')),
  label: z.string().trim().max(60).optional(),
  /** Defaults to 'admin' so any pre-role caller keeps its original meaning. */
  role: z.enum(['operator', 'sales', 'content', 'catalog', 'admin']).default('admin'),
});

/** POST /api/admin/allowlist — grant panel access with a role, or change an
 *  existing entry's role (mobile is the row's identity, so this is an upsert).
 *  Applied on the spot if the account exists; otherwise at their first login. */
async function POSTImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'users:manage');
  if ('response' in auth) return auth.response;
  const v = await validateBody(req, payload);
  if (!v.ok) return v.response;

  // Demoting the last admin through a role change would lock everyone out of
  // access management just as surely as deleting the row — same guard, and
  // (G-159 follow-up) enforced INSIDE addToAllowlist under a row lock now,
  // not as an unlocked pre-check here — see lockAdminRowsAndTarget's doc
  // comment in adminAllowlistRepo.ts for why a pre-check here was racy.

  // Registry row, user role bump, and the audit row all commit as one unit
  // (G-160) — a failure anywhere in here rolls the whole grant back instead
  // of leaving the registry, the live user account, and the audit trail
  // disagreeing about whether it happened.
  const { promotedUserId } = await getDb().transaction(async (tx) => {
    const result = await addToAllowlist(v.data.mobile, v.data.label ?? null, v.data.role, auth.session.id, tx);
    await audit(
      auth.session.id,
      'admin_allowlist.add',
      { type: 'admin_allowlist', id: v.data.mobile },
      undefined,
      { mobile: v.data.mobile, label: v.data.label ?? null, role: v.data.role, promotedUserId: result.promotedUserId },
      tx,
    );
    return result;
  });
  // A grant/re-role invalidates the target's existing sessions so their NEXT
  // request carries the new role via a fresh login/refresh, not a stale JWT.
  // Redundant with addToAllowlist's own updateUser call (already did this
  // inside the same transaction above) — kept as defense-in-depth.
  if (promotedUserId) await revokeAllForUser(promotedUserId);
  return NextResponse.json({ entries: await listAllowlist() }, { status: 201 });
}

export const GET = withApiErrorHandling(GETImpl);
export const POST = withApiErrorHandling(POSTImpl);

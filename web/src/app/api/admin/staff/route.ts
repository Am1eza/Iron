import { NextResponse, type NextRequest } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { can } from '@/lib/auth/roles';
import { getDb } from '@/lib/server/db/client';
import { users } from '@/lib/server/db/schema';

/** Last 4 digits only, e.g. `0912***4567` — the picker only ever needs
 *  `mobile` as a fallback LABEL for a staff member with no display name set
 *  (see LeadsTab.tsx/LeadDetail.tsx: `name ?? mobile`), not as contact
 *  information. G-156: this endpoint is gated on `leads:write`, which every
 *  sales rep holds — the full number (including the system admin's) was
 *  reachable by anyone who can be assigned a lead, not just `users:manage`
 *  holders who already see it in full on `/admin/users`. */
function maskMobile(mobile: string): string {
  return mobile.length > 6 ? `${mobile.slice(0, 4)}***${mobile.slice(-4)}` : mobile;
}

/** GET /api/admin/staff — active staff users, for the lead-assignee picker.
 *  Gated on leads:write (the permission needed to actually assign). */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:write');
  if ('response' in auth) return auth.response;
  const rows = await getDb()
    .select({ id: users.id, name: users.name, mobile: users.mobile, role: users.role })
    .from(users)
    .where(and(inArray(users.role, ['operator', 'sales', 'content', 'catalog', 'admin']), eq(users.isActive, true)))
    .orderBy(users.role);
  const full = can(auth.session.role, 'users:manage');
  return NextResponse.json(
    {
      staff: rows.map((r) => ({
        id: r.id,
        name: r.name ?? undefined,
        mobile: full ? r.mobile : maskMobile(r.mobile),
        role: r.role,
      })),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export const GET = withApiErrorHandling(GETImpl);

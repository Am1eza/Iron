import { NextResponse, type NextRequest } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { getDb } from '@/lib/server/db/client';
import { users } from '@/lib/server/db/schema';

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
  return NextResponse.json({
    staff: rows.map((r) => ({ id: r.id, name: r.name ?? undefined, mobile: r.mobile, role: r.role })),
  });
}

export const GET = withApiErrorHandling(GETImpl);

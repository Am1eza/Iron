import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit } from '@/lib/server/utils/apiGuard';
import { getDb } from '@/lib/server/db/client';
import { clubMemberships } from '@/lib/server/db/schema';

const payload = z.object({ tier: z.enum(['iron', 'steel', 'poolad']) });

/** PATCH /api/admin/club/members/{id} — manual tier override. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'club:manage');
  if ('response' in auth) return auth.response;
  const { id } = await ctx.params;
  const v = await validateBody(req, payload);
  if (!v.ok) return v.response;
  const rows = await getDb().update(clubMemberships).set({ tier: v.data.tier }).where(eq(clubMemberships.id, id)).returning();
  if (!rows[0]) return NextResponse.json({ error: 'not_found', message: 'عضو یافت نشد.' }, { status: 404 });
  await audit(auth.session.id, 'club.tier', { type: 'clubMembership', id }, null, v.data);
  return NextResponse.json({ member: rows[0] });
}

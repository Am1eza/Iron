import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { findLead, leadItemsOf, leadNotesOf, proformasOfLead, updateLead } from '@/lib/server/repos/leadsRepo';
import { recomputeTier } from '@/lib/server/repos/clubRepo';

/** GET /api/admin/leads/{id} — full lead: items, notes, proformas. */
async function GETImpl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:read');
  if ('response' in auth) return auth.response;
  const { id } = await ctx.params;
  const lead = await findLead(id);
  if (!lead) return NextResponse.json({ error: 'not_found', message: 'سرنخ یافت نشد.' }, { status: 404 });
  const [items, notes, proformas] = await Promise.all([leadItemsOf(id), leadNotesOf(id), proformasOfLead(id)]);
  return NextResponse.json({ lead, items, notes, proformas }, { headers: { 'Cache-Control': 'no-store' } });
}

const patchPayload = z.object({
  status: z.enum(['new', 'contacted', 'won', 'lost']).optional(),
  assigneeId: z.string().nullable().optional(),
  callbackAt: z.string().datetime().nullable().optional(),
});

/** PATCH /api/admin/leads/{id} — status / assignee / callback. */
async function PATCHImpl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:write');
  if ('response' in auth) return auth.response;
  const { id } = await ctx.params;
  const v = await validateBody(req, patchPayload);
  if (!v.ok) return v.response;

  const before = await findLead(id);
  if (!before) return NextResponse.json({ error: 'not_found', message: 'سرنخ یافت نشد.' }, { status: 404 });
  const lead = await updateLead(id, {
    status: v.data.status,
    assigneeId: v.data.assigneeId === undefined ? undefined : v.data.assigneeId,
    callbackAt: v.data.callbackAt === undefined ? undefined : v.data.callbackAt ? new Date(v.data.callbackAt) : null,
  });
  await audit(auth.session.id, 'lead.update', { type: 'lead', id }, { status: before.status }, v.data);
  // Recompute on any change into OR out of 'won' — recomputeTier derives
  // the tier fresh from the live won-lead count and downgrades correctly
  // when it's lower than stored, so an admin reverting a mis-marked 'won'
  // lead (e.g. back to 'lost') un-advances the tier too, not just upgrades.
  const wonChanged = v.data.status !== undefined && (v.data.status === 'won' || before.status === 'won');
  if (wonChanged && lead?.userId) void recomputeTier(lead.userId).catch(() => {});
  return NextResponse.json({ lead });
}

export const GET = withApiErrorHandling(GETImpl);
export const PATCH = withApiErrorHandling(PATCHImpl);

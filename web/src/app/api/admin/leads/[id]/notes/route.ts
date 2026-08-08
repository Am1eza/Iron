import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { addLeadNote, findLead } from '@/lib/server/repos/leadsRepo';
import { canActOnAssignedRecord } from '@/lib/auth/roles';

const payload = z.object({ text: z.string().trim().min(1).max(2000) });

/** POST /api/admin/leads/{id}/notes — a sales note on the lead. Ownership-
 *  scoped like orders (W16): only the lead's assignee, or a manager
 *  (leads:manage), may add a note — a `leads:write`-only colleague gets a
 *  clear 403 instead of silently being able to write into anyone's lead. */
async function POSTImpl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:write');
  if ('response' in auth) return auth.response;
  const { id } = await ctx.params;
  const lead = await findLead(id);
  if (!lead) {
    return NextResponse.json({ error: 'not_found', message: 'سرنخ یافت نشد.' }, { status: 404 });
  }
  if (!canActOnAssignedRecord(auth.session, lead.assigneeId)) {
    return NextResponse.json(
      { error: 'lead_forbidden', message: 'این سرنخ به کارشناس دیگری واگذار شده؛ فقط او یا مدیر سیستم می‌تواند آن را تغییر دهد.' },
      { status: 403 },
    );
  }
  const v = await validateBody(req, payload);
  if (!v.ok) return v.response;
  const note = await addLeadNote(id, auth.session.id, v.data.text);
  await audit(auth.session.id, 'lead.note', { type: 'lead', id }, null, { text: v.data.text });
  return NextResponse.json({ note }, { status: 201 });
}

export const POST = withApiErrorHandling(POSTImpl);

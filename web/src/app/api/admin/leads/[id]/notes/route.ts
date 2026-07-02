import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { addLeadNote, findLead } from '@/lib/server/repos/leadsRepo';

const payload = z.object({ text: z.string().trim().min(1).max(2000) });

/** POST /api/admin/leads/{id}/notes — a sales note on the lead. */
async function POSTImpl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:write');
  if ('response' in auth) return auth.response;
  const { id } = await ctx.params;
  if (!(await findLead(id))) {
    return NextResponse.json({ error: 'not_found', message: 'سرنخ یافت نشد.' }, { status: 404 });
  }
  const v = await validateBody(req, payload);
  if (!v.ok) return v.response;
  const note = await addLeadNote(id, auth.session.id, v.data.text);
  return NextResponse.json({ note }, { status: 201 });
}

export const POST = withApiErrorHandling(POSTImpl);

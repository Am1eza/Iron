import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { updateLeadItem } from '@/lib/server/repos/leadsRepo';

const payload = z
  .object({
    qty: z.number().positive().optional(),
    unitPrice: z.number().nonnegative().optional(),
  })
  .refine((v) => v.qty !== undefined || v.unitPrice !== undefined, { message: 'حداقل یک فیلد باید ارسال شود.' });

/** PATCH /api/admin/leads/{id}/items/{itemId} — adjust qty/unitPrice on a
 *  lead's line item before proforma issuance (US-19.4). `lineTotal` is
 *  always recomputed server-side (see updateLeadItem), never accepted
 *  directly from the client. */
async function PATCHImpl(req: NextRequest, ctx: { params: Promise<{ id: string; itemId: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:write');
  if ('response' in auth) return auth.response;
  const { id, itemId } = await ctx.params;
  const v = await validateBody(req, payload);
  if (!v.ok) return v.response;

  const item = await updateLeadItem(itemId, id, v.data);
  if (!item) return NextResponse.json({ error: 'not_found', message: 'قلم سرنخ یافت نشد.' }, { status: 404 });

  await audit(auth.session.id, 'lead.item_update', { type: 'lead_item', id: itemId }, null, v.data);
  return NextResponse.json({ item });
}

export const PATCH = withApiErrorHandling(PATCHImpl);

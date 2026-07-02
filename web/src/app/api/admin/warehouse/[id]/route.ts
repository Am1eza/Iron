import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit } from '@/lib/server/utils/apiGuard';
import { updateWarehouseItem } from '@/lib/server/repos/ordersRepo';

const payload = z.object({
  status: z.enum(['pending', 'stored', 'selling', 'released']).optional(),
  monthlyFeeToman: z.number().min(0).optional(),
  quantityTons: z.number().positive().optional(),
});

/** PATCH /api/admin/warehouse/{id} — status / fee / quantity. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'leads:write');
  if ('response' in auth) return auth.response;
  const { id } = await ctx.params;
  const v = await validateBody(req, payload);
  if (!v.ok) return v.response;
  const item = await updateWarehouseItem(id, v.data);
  if (!item) return NextResponse.json({ error: 'not_found', message: 'کالا یافت نشد.' }, { status: 404 });
  await audit(auth.session.id, 'warehouse.update', { type: 'warehouseItem', id }, null, v.data);
  return NextResponse.json({ item });
}

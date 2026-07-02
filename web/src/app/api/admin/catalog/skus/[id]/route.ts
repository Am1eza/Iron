import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit } from '@/lib/server/utils/apiGuard';
import { updateSku, deactivateSku } from '@/lib/server/repos/catalogAdminRepo';
import { finiteNumber } from '@/lib/validation/utils';

const patchPayload = z.object({
  slug: z.string().trim().min(1).max(120).optional(),
  name: z.string().trim().min(1).max(160).optional(),
  standard: z.string().trim().max(40).optional(),
  size: z.string().trim().max(40).optional(),
  grade: z.string().trim().max(40).optional(),
  factory: z.string().trim().max(80).optional(),
  theoreticalWeightKg: finiteNumber.positive().max(100_000).optional(),
  unit: z.enum(['kg', 'branch', 'sheet', 'meter']).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'catalog:write');
  if ('response' in auth) return auth.response;
  const { id } = await ctx.params;
  const v = await validateBody(req, patchPayload);
  if (!v.ok) return v.response;
  const sku = await updateSku(id, v.data);
  if (!sku) return NextResponse.json({ error: 'not_found', message: 'محصول یافت نشد.' }, { status: 404 });
  await audit(auth.session.id, 'catalog.sku.update', { type: 'sku', id }, null, v.data);
  return NextResponse.json({ sku });
}

/** DELETE = soft-delete; priced SKUs keep their history forever. */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'catalog:write');
  if ('response' in auth) return auth.response;
  const { id } = await ctx.params;
  const sku = await deactivateSku(id);
  if (!sku) return NextResponse.json({ error: 'not_found', message: 'محصول یافت نشد.' }, { status: 404 });
  await audit(auth.session.id, 'catalog.sku.deactivate', { type: 'sku', id });
  return NextResponse.json({ ok: true });
}

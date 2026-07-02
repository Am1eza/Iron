import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { updateSubCategory } from '@/lib/server/repos/catalogAdminRepo';
import { finiteNumber } from '@/lib/validation/utils';

const patchPayload = z.object({
  slug: z.string().trim().min(1).max(60).optional(),
  name: z.string().trim().min(1).max(80).optional(),
  order: finiteNumber.int().min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
});

async function PATCHImpl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'catalog:write');
  if ('response' in auth) return auth.response;
  const { id } = await ctx.params;
  const v = await validateBody(req, patchPayload);
  if (!v.ok) return v.response;
  const subCategory = await updateSubCategory(id, v.data);
  if (!subCategory) return NextResponse.json({ error: 'not_found', message: 'زیر‌دسته یافت نشد.' }, { status: 404 });
  await audit(auth.session.id, 'catalog.sub.update', { type: 'subCategory', id }, null, v.data);
  return NextResponse.json({ subCategory });
}

async function DELETEImpl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'catalog:write');
  if ('response' in auth) return auth.response;
  const { id } = await ctx.params;
  const subCategory = await updateSubCategory(id, { isActive: false });
  if (!subCategory) return NextResponse.json({ error: 'not_found', message: 'زیر‌دسته یافت نشد.' }, { status: 404 });
  await audit(auth.session.id, 'catalog.sub.deactivate', { type: 'subCategory', id });
  return NextResponse.json({ ok: true });
}

export const PATCH = withApiErrorHandling(PATCHImpl);
export const DELETE = withApiErrorHandling(DELETEImpl);

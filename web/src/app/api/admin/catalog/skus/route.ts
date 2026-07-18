import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { adminListSkus, createSku } from '@/lib/server/repos/catalogAdminRepo';
import { finiteNumber } from '@/lib/validation/utils';

async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'catalog:read');
  if ('response' in auth) return auth.response;
  const p = req.nextUrl.searchParams;
  const result = await adminListSkus({
    categoryId: p.get('categoryId') ?? undefined,
    subCategoryId: p.get('subCategoryId') ?? undefined,
    q: p.get('q') ?? undefined,
    includeInactive: p.get('all') === 'true',
    page: Math.max(1, Number(p.get('page') ?? 1) || 1),
  });
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}

const createPayload = z.object({
  subCategoryId: z.string().min(1),
  categoryId: z.string().min(1),
  slug: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(160),
  standard: z.string().trim().max(40).optional(),
  size: z.string().trim().max(40).optional(),
  grade: z.string().trim().max(40).optional(),
  factory: z.string().trim().max(80).optional(),
  theoreticalWeightKg: finiteNumber.positive().max(100_000).optional(),
  unit: z.enum(['kg', 'branch', 'sheet', 'meter']).optional(),
  imageUrl: z.string().url().max(300).nullable().optional(),
});

async function POSTImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'catalog:write');
  if ('response' in auth) return auth.response;
  const v = await validateBody(req, createPayload);
  if (!v.ok) return v.response;
  const sku = await createSku(v.data);
  await audit(auth.session.id, 'catalog.sku.create', { type: 'sku', id: sku.id }, null, v.data);
  return NextResponse.json({ sku }, { status: 201 });
}

export const GET = withApiErrorHandling(GETImpl);
export const POST = withApiErrorHandling(POSTImpl);

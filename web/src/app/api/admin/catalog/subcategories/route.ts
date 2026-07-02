import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { adminListSubCategories, createSubCategory } from '@/lib/server/repos/catalogAdminRepo';
import { finiteNumber } from '@/lib/validation/utils';

async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'catalog:read');
  if ('response' in auth) return auth.response;
  const categoryId = req.nextUrl.searchParams.get('categoryId') ?? undefined;
  return NextResponse.json(
    { subCategories: await adminListSubCategories(categoryId) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

const createPayload = z.object({
  categoryId: z.string().min(1),
  slug: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1).max(80),
  order: finiteNumber.int().min(0).max(9999).optional(),
});

async function POSTImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'catalog:write');
  if ('response' in auth) return auth.response;
  const v = await validateBody(req, createPayload);
  if (!v.ok) return v.response;
  const subCategory = await createSubCategory(v.data);
  await audit(auth.session.id, 'catalog.sub.create', { type: 'subCategory', id: subCategory.id }, null, v.data);
  return NextResponse.json({ subCategory }, { status: 201 });
}

export const GET = withApiErrorHandling(GETImpl);
export const POST = withApiErrorHandling(POSTImpl);

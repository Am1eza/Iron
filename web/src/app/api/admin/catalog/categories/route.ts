import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { adminListCategoriesWithCounts, createCategory } from '@/lib/server/repos/catalogAdminRepo';
import { catalogErrorResponse, revalidateCatalog } from '@/lib/server/utils/catalogRoute';
import { finiteNumber, slugSchema, uploadPathSchema } from '@/lib/validation/utils';

async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'catalog:read');
  if ('response' in auth) return auth.response;
  // …WithCounts: the admin has to see that a category carries 7 sub-categories
  // and 210 live products BEFORE deciding whether to hide it.
  return NextResponse.json(
    { categories: await adminListCategoriesWithCounts() },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

const createPayload = z.object({
  slug: slugSchema(60),
  name: z.string().trim().min(1).max(80),
  order: finiteNumber.int().min(0).max(9999).optional(),
  iconId: z.string().trim().max(60).optional(),
  imageUrl: uploadPathSchema.nullable().optional(),
});

async function POSTImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'catalog:write');
  if ('response' in auth) return auth.response;
  const v = await validateBody(req, createPayload);
  if (!v.ok) return v.response;
  let category;
  try {
    category = await createCategory(v.data);
  } catch (err) {
    const mapped = catalogErrorResponse(err);
    if (mapped) return mapped;
    throw err;
  }
  await audit(auth.session.id, 'catalog.category.create', { type: 'category', id: category.id }, null, v.data);
  // Taxonomy edits must show up on the public site immediately (nav,
  // mega-menu, home cascade, /prices) — not after the 5-minute ISR window.
  revalidateCatalog('taxonomy');
  return NextResponse.json({ category }, { status: 201 });
}

export const GET = withApiErrorHandling(GETImpl);
export const POST = withApiErrorHandling(POSTImpl);

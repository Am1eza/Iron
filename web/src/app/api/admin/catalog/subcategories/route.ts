import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { adminListSubCategoriesWithCounts, createSubCategory } from '@/lib/server/repos/catalogAdminRepo';
import {
  catalogErrorResponse,
  clearRedirectShadow,
  revalidateCatalog,
  subCategoryPublicPath,
} from '@/lib/server/utils/catalogRoute';
import { finiteNumber, subCategorySlugSchema } from '@/lib/validation/utils';
import { normalizeCatalogText } from '@/lib/server/utils/persianZwnj';

async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'catalog:read');
  if ('response' in auth) return auth.response;
  const categoryId = req.nextUrl.searchParams.get('categoryId') ?? undefined;
  return NextResponse.json(
    { subCategories: await adminListSubCategoriesWithCounts(categoryId) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

const createPayload = z.object({
  categoryId: z.string().min(1),
  slug: subCategorySlugSchema(60),
  name: z.string().trim().min(1).max(80).transform(normalizeCatalogText),
  // Display-only cluster label (not a real hierarchy level, see catalog.ts).
  // Empty string means "no group" — normalized to null so it matches an
  // untouched subcategory rather than becoming a spurious "" group.
  groupLabel: z
    .string()
    .trim()
    .max(80)
    .transform(normalizeCatalogText)
    .transform((v) => v || null)
    .nullable()
    .optional(),
  order: finiteNumber.int().min(0).max(9999).optional(),
});

async function POSTImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'catalog:write');
  if ('response' in auth) return auth.response;
  const v = await validateBody(req, createPayload);
  if (!v.ok) return v.response;
  let subCategory;
  try {
    subCategory = await createSubCategory(v.data);
  } catch (err) {
    const mapped = catalogErrorResponse(err);
    if (mapped) return mapped;
    throw err;
  }
  // The persisted row, not the request body — see the category route.
  await audit(auth.session.id, 'catalog.sub.create', { type: 'sub', id: subCategory.id }, null, subCategory);
  // Retiring a sub-category and rebuilding it days later is a sequence this
  // catalog has already been through; the tombstone the delete left would
  // otherwise make the rebuilt page unreachable. See `clearRedirectShadow`.
  await clearRedirectShadow([await subCategoryPublicPath(subCategory.categoryId, subCategory.slug)]);
  await revalidateCatalog('taxonomy');
  return NextResponse.json({ subCategory }, { status: 201 });
}

export const GET = withApiErrorHandling(GETImpl);
export const POST = withApiErrorHandling(POSTImpl);

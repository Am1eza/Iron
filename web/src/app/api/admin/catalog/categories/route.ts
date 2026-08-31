import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { adminListCategoriesWithCounts, createCategory } from '@/lib/server/repos/catalogAdminRepo';
import { catalogErrorResponse, clearRedirectShadow, revalidateCatalog } from '@/lib/server/utils/catalogRoute';
import { routes } from '@/lib/routes';
import { finiteNumber, seoMetaSchema, slugSchema, uploadPathSchema } from '@/lib/validation/utils';
import { normalizeCatalogText } from '@/lib/server/utils/persianZwnj';

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
  name: z.string().trim().min(1).max(80).transform(normalizeCatalogText),
  order: finiteNumber.int().min(0).max(9999).optional(),
  iconId: z.string().trim().max(60).optional(),
  imageUrl: uploadPathSchema.nullable().optional(),
  // On create too, not only on PATCH — see `seoMetaSchema`'s header for the
  // article bug that came from having it on one and not the other.
  seo: seoMetaSchema,
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
  // The persisted row, not the request body — `freeSlug` can have settled a
  // different slug than the one that was sent, and the log is what the delete
  // entry's `before` is meant to be comparable with.
  await audit(auth.session.id, 'catalog.category.create', { type: 'category', id: category.id }, null, category);
  // A delete leaves a tombstone on the path it vacated, and a redirect beats a
  // route match — so rebuilding a retired category at the same slug has to
  // take that tombstone back down or the new page 308s to `/prices` forever.
  await clearRedirectShadow([routes.category(category.slug)]);
  // Taxonomy edits must show up on the public site immediately (nav,
  // mega-menu, home cascade, /prices) — not after the 5-minute ISR window.
  await revalidateCatalog('taxonomy');
  return NextResponse.json({ category }, { status: 201 });
}

export const GET = withApiErrorHandling(GETImpl);
export const POST = withApiErrorHandling(POSTImpl);

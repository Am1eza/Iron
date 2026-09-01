import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { categoryImpact, deleteCategory, updateCategory } from '@/lib/server/repos/catalogAdminRepo';
import {
  catalogErrorResponse,
  openOrdersBlock,
  planDeletedNodeRedirects,
  redirectCategorySlugChange,
  revalidateCatalog,
  writeCatalogRedirects,
} from '@/lib/server/utils/catalogRoute';
import { finiteNumber, nonEmptyPatch, seoMetaSchema, slugSchema, uploadPathSchema } from '@/lib/validation/utils';
import { normalizeCatalogText } from '@/lib/server/utils/persianZwnj';

const patchPayload = nonEmptyPatch(
  z.object({
    slug: slugSchema(60).optional(),
    name: z.string().trim().min(1).max(80).transform(normalizeCatalogText).optional(),
    order: finiteNumber.int().min(0).max(9999).optional(),
    iconId: z.string().trim().max(60).optional(),
    // The repo has always accepted `imageUrl`; only this schema blocked it, so
    // a category image was unsettable through the panel despite the column,
    // the repo argument and the public read all existing.
    imageUrl: uploadPathSchema.nullable().optional(),
    // The category's `SeoMeta` blob. Its `description` is what the mega-menu
    // panel and `catalogNavigationJsonLd` publish — catalog copy belongs in
    // the panel, so the column has to be reachable from it and not only from
    // a raw DB write.
    seo: seoMetaSchema,
  }),
);

async function PATCHImpl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'catalog:write');
  if ('response' in auth) return auth.response;
  const { id } = await ctx.params;
  const v = await validateBody(req, patchPayload);
  if (!v.ok) return v.response;
  let result;
  try {
    result = await updateCategory(id, v.data);
  } catch (err) {
    const mapped = catalogErrorResponse(err);
    if (mapped) return mapped;
    throw err;
  }
  if (!result) return NextResponse.json({ error: 'not_found', message: 'دسته یافت نشد.' }, { status: 404 });
  // The real prior row, not `null`: without it the activity log rendered every
  // field as «— ← مقدار جدید» and the one thing it exists to answer — what the
  // slug used to be, so a broken public URL can be restored — was never
  // recorded anywhere.
  await audit(auth.session.id, 'catalog.category.update', { type: 'category', id }, result.before, result.after);
  if (v.data.slug && v.data.slug !== result.before.slug) {
    await redirectCategorySlugChange(id, result.before.slug, v.data.slug);
  }
  await revalidateCatalog('taxonomy');
  return NextResponse.json({ category: result.after });
}

/**
 * DELETE really deletes: the category, its sub-categories and their products
 * all go (FK cascade). Quotes and orders keep their frozen snapshot — their
 * `sku_id` is ON DELETE SET NULL — so no business history is destroyed.
 */
async function DELETEImpl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'catalog:write');
  if ('response' in auth) return auth.response;
  const { id } = await ctx.params;
  const impact = await categoryImpact(id);
  const blocked = openOrdersBlock(req, impact);
  if (blocked) return blocked;
  // Before the delete — the sub-categories and products whose URLs this takes
  // down go with it by cascade, so this is the last moment they can be listed.
  const tombstone = await planDeletedNodeRedirects('category', id);
  const result = await deleteCategory(id);
  if (!result) return NextResponse.json({ error: 'not_found', message: 'دسته یافت نشد.' }, { status: 404 });
  const { removed, subtree } = result;
  // The WHOLE row, plus the WHOLE subtree it cascaded away — not just name
  // and slug, and not just the category's own two columns. A cascade takes
  // sub-categories and products with it that the old audit entry never
  // recorded at all, so «restore this delete» had nothing to restore beyond
  // the category shell. `_subtree` carries what a real restore needs; price
  // history is deliberately excluded and only counted (see
  // `CategorySubtreeSnapshot`).
  await audit(auth.session.id, 'catalog.category.delete', { type: 'category', id }, { ...removed, _subtree: subtree }, null);
  // Every URL under a deleted category — its own page, its subs, its products
  // — points at the price index instead of hard-404ing.
  await writeCatalogRedirects(tombstone);
  await revalidateCatalog('taxonomy');
  return NextResponse.json({ ok: true });
}

export const PATCH = withApiErrorHandling(PATCHImpl);
export const DELETE = withApiErrorHandling(DELETEImpl);

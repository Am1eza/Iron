import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { deleteSubCategoryGuarded, subCategoryImpact, updateSubCategory } from '@/lib/server/repos/catalogAdminRepo';
import {
  catalogErrorResponse,
  openOrdersBlock,
  planDeletedNodeRedirects,
  redirectSubCategoryChange,
  revalidateCatalog,
  writeCatalogRedirects,
} from '@/lib/server/utils/catalogRoute';
import { finiteNumber, nonEmptyPatch, subCategorySlugSchema } from '@/lib/validation/utils';
import { normalizeCatalogText } from '@/lib/server/utils/persianZwnj';
import { deleteOrphanedUploadsIfUnused } from '@/lib/server/utils/uploadCleanup';

const patchPayload = nonEmptyPatch(
  z.object({
    slug: subCategorySlugSchema(60).optional(),
    name: z.string().trim().min(1).max(80).transform(normalizeCatalogText).optional(),
    // Display-only cluster label (not a real hierarchy level, see catalog.ts).
    // Empty string clears the group (normalized to null, same as create).
    groupLabel: z
      .string()
      .trim()
      .max(80)
      .transform(normalizeCatalogText)
      .transform((v) => v || null)
      .nullable()
      .optional(),
    order: finiteNumber.int().min(0).max(9999).optional(),
    // Moving a sub-category between categories was impossible: a mis-filed
    // sub could only be retired and rebuilt. The repo re-parents its products
    // in the same call so the two can't drift apart.
    categoryId: z.string().min(1).max(64).optional(),
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
    result = await updateSubCategory(id, v.data);
  } catch (err) {
    const mapped = catalogErrorResponse(err);
    if (mapped) return mapped;
    throw err;
  }
  if (!result) return NextResponse.json({ error: 'not_found', message: 'زیر‌دسته یافت نشد.' }, { status: 404 });
  // `type: 'sub'`, not `'subCategory'`: ENTITY_LABEL maps `sub` → «زیردسته» and
  // ActivityItem's deep-link switch matches on it. The old string fell through
  // to the raw identifier, printing Latin «subCategory» inline in a Persian
  // sentence and losing the link through to the catalog.
  await audit(auth.session.id, 'catalog.sub.update', { type: 'sub', id }, result.before, result.after);
  // A MOVE changes this sub's public URL exactly as a rename does — the parent
  // category's slug is the first segment of it — and every product underneath
  // moves with it. Comparing slugs alone left all of those hard-404ing.
  await redirectSubCategoryChange(id, result.before, result.after);
  await revalidateCatalog('taxonomy');
  return NextResponse.json({ subCategory: result.after });
}

/** DELETE really deletes — the sub-category and every product under it. */
async function DELETEImpl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'catalog:write');
  if ('response' in auth) return auth.response;
  const { id } = await ctx.params;
  const impact = await subCategoryImpact(id);
  // Cheap, informational rejection for the common case — see the SKU
  // routes' identical comment. NOT the actual guard against a race: impact
  // was read outside any lock, so it can be stale by the time the delete
  // runs below.
  const blocked = openOrdersBlock(req, impact);
  if (blocked) return blocked;
  const override = req.nextUrl.searchParams.get('override') === 'true';
  // Before the delete: its products cascade away with it.
  const tombstone = await planDeletedNodeRedirects('subCategory', id);
  // The actual guard (G-164): re-checked, LOCKED, atomically with the
  // cascade delete — across every sku this sub-category would take down.
  const guarded = await deleteSubCategoryGuarded(id, { override });
  if (guarded.status === 'not_found') {
    return NextResponse.json({ error: 'not_found', message: 'زیر‌دسته یافت نشد.' }, { status: 404 });
  }
  if (guarded.status === 'blocked') {
    return NextResponse.json(
      {
        error: 'open_orders',
        message: `${guarded.openOrders} سفارش باز به این مورد وابسته است. برای حذف قطعی، درخواست را با override=true دوباره بفرست.`,
        impact: { ...impact, openOrders: guarded.openOrders },
      },
      { status: 409 },
    );
  }
  const { removed, subtree } = guarded;
  // The whole row, plus the products it cascaded away — see the category
  // route for why two columns and a bare count is not a recovery story.
  await audit(auth.session.id, 'catalog.sub.delete', { type: 'sub', id }, { ...removed, _subtree: subtree }, null);
  // I-212 — same cascade-orphan bug as category delete, one level down: the
  // sub-category itself has no image, but every product under it does.
  await deleteOrphanedUploadsIfUnused(subtree.skus.map((s) => s.imageUrl));
  // The sub's own page and each of its products land on the parent category.
  await writeCatalogRedirects(tombstone);
  await revalidateCatalog('taxonomy');
  return NextResponse.json({ ok: true });
}

export const PATCH = withApiErrorHandling(PATCHImpl);
export const DELETE = withApiErrorHandling(DELETEImpl);

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { deleteSubCategory, updateSubCategory } from '@/lib/server/repos/catalogAdminRepo';
import {
  catalogErrorResponse,
  planDeletedNodeRedirects,
  redirectSubCategoryChange,
  revalidateCatalog,
  writeCatalogRedirects,
} from '@/lib/server/utils/catalogRoute';
import { finiteNumber, nonEmptyPatch, subCategorySlugSchema } from '@/lib/validation/utils';
import { normalizeCatalogText } from '@/lib/server/utils/persianZwnj';

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
    categoryId: z.string().min(1).optional(),
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
  // Before the delete: its products cascade away with it.
  const tombstone = await planDeletedNodeRedirects('subCategory', id);
  const removed = await deleteSubCategory(id);
  if (!removed) return NextResponse.json({ error: 'not_found', message: 'زیر‌دسته یافت نشد.' }, { status: 404 });
  // The whole row — see the category route for why two columns is not a
  // recovery story.
  await audit(auth.session.id, 'catalog.sub.delete', { type: 'sub', id }, removed, null);
  // The sub's own page and each of its products land on the parent category.
  await writeCatalogRedirects(tombstone);
  await revalidateCatalog('taxonomy');
  return NextResponse.json({ ok: true });
}

export const PATCH = withApiErrorHandling(PATCHImpl);
export const DELETE = withApiErrorHandling(DELETEImpl);

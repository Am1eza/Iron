import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { updateSubCategory } from '@/lib/server/repos/catalogAdminRepo';
import {
  catalogErrorResponse,
  redirectTaxonomySlugChange,
  revalidateCatalog,
} from '@/lib/server/utils/catalogRoute';
import { finiteNumber, nonEmptyPatch, slugSchema } from '@/lib/validation/utils';
import { normalizePersian } from '@/lib/utils/persianText';

const patchPayload = nonEmptyPatch(
  z.object({
    slug: slugSchema(60).optional(),
    name: z.string().trim().min(1).max(80).transform(normalizePersian).optional(),
    order: finiteNumber.int().min(0).max(9999).optional(),
    // Moving a sub-category between categories was impossible: a mis-filed
    // sub could only be retired and rebuilt. The repo re-parents its products
    // in the same call so the two can't drift apart.
    categoryId: z.string().min(1).optional(),
    isActive: z.boolean().optional(),
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
  if (v.data.slug && v.data.slug !== result.before.slug) {
    await redirectTaxonomySlugChange('subCategory', id, result.before.slug, v.data.slug);
  }
  revalidateCatalog('taxonomy');
  return NextResponse.json({ subCategory: result.after });
}

async function DELETEImpl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'catalog:write');
  if ('response' in auth) return auth.response;
  const { id } = await ctx.params;
  const result = await updateSubCategory(id, { isActive: false });
  if (!result) return NextResponse.json({ error: 'not_found', message: 'زیر‌دسته یافت نشد.' }, { status: 404 });
  await audit(
    auth.session.id,
    'catalog.sub.deactivate',
    { type: 'sub', id },
    { name: result.before.name, slug: result.before.slug, isActive: result.before.isActive },
    { isActive: false },
  );
  revalidateCatalog('taxonomy');
  return NextResponse.json({ ok: true });
}

export const PATCH = withApiErrorHandling(PATCHImpl);
export const DELETE = withApiErrorHandling(DELETEImpl);

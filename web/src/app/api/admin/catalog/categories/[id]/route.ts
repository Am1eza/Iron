import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { updateCategory } from '@/lib/server/repos/catalogAdminRepo';
import {
  catalogErrorResponse,
  redirectTaxonomySlugChange,
  revalidateCatalog,
} from '@/lib/server/utils/catalogRoute';
import { finiteNumber, nonEmptyPatch, seoMetaSchema, slugSchema, uploadPathSchema } from '@/lib/validation/utils';
import { normalizePersian } from '@/lib/utils/persianText';

const patchPayload = nonEmptyPatch(
  z.object({
    slug: slugSchema(60).optional(),
    name: z.string().trim().min(1).max(80).transform(normalizePersian).optional(),
    order: finiteNumber.int().min(0).max(9999).optional(),
    iconId: z.string().trim().max(60).optional(),
    // The repo has always accepted `imageUrl`; only this schema blocked it, so
    // a category image was unsettable through the panel despite the column,
    // the repo argument and the public read all existing.
    imageUrl: uploadPathSchema.nullable().optional(),
    isActive: z.boolean().optional(),
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
    await redirectTaxonomySlugChange('category', id, result.before.slug, v.data.slug);
  }
  await revalidateCatalog('taxonomy');
  return NextResponse.json({ category: result.after });
}

/** DELETE = soft-delete (isActive=false) — history is never destroyed. */
async function DELETEImpl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'catalog:write');
  if ('response' in auth) return auth.response;
  const { id } = await ctx.params;
  const result = await updateCategory(id, { isActive: false });
  if (!result) return NextResponse.json({ error: 'not_found', message: 'دسته یافت نشد.' }, { status: 404 });
  // Name and slug in `before`, so the log can say WHICH category left the site
  // — the old bare `{type, id}` entry could not.
  await audit(
    auth.session.id,
    'catalog.category.deactivate',
    { type: 'category', id },
    { name: result.before.name, slug: result.before.slug, isActive: result.before.isActive },
    { isActive: false },
  );
  await revalidateCatalog('taxonomy');
  return NextResponse.json({ ok: true });
}

export const PATCH = withApiErrorHandling(PATCHImpl);
export const DELETE = withApiErrorHandling(DELETEImpl);

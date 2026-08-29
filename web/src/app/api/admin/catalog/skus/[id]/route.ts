import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { updateSku } from '@/lib/server/repos/catalogAdminRepo';
import { getDb } from '@/lib/server/db/client';
import { categories, subCategories } from '@/lib/server/db/schema';
import { catalogErrorResponse, redirectOnSlugChange, revalidateCatalog } from '@/lib/server/utils/catalogRoute';
import { finiteNumber, nonEmptyPatch, slugSchema, uploadPathSchema } from '@/lib/validation/utils';
import { normalizePersian, normalizeSizeText } from '@/lib/utils/persianText';
import { toPersianDigits } from '@/lib/utils/format';
import { routes } from '@/lib/routes';
import { PRICE_BASIS_VALUES, PRICE_UNIT_VALUES } from '@/lib/types/domain';

const optionalPersianText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v ? normalizePersian(v) : v === '' ? null : v));

const patchPayload = nonEmptyPatch(
  z.object({
    slug: slugSchema(120).optional(),
    name: z.string().trim().min(1).max(160).transform(normalizePersian).transform(toPersianDigits).optional(),
    // `.nullable()` throughout: sending `undefined` for a cleared box made zod
    // drop the key and drizzle omit the column, so an admin who deleted a
    // wrong factory name was told «ذخیره شد» while the wrong value stayed.
    standard: optionalPersianText(40),
    size: z
      .string()
      .trim()
      .max(40)
      .nullable()
      .optional()
      .transform((v) => (v ? normalizeSizeText(v) : v === '' ? null : v)),
    grade: optionalPersianText(40),
    // Independent product form/finish; nullable so clearing the picker clears
    // the column instead of silently retaining a stale condition.
    condition: optionalPersianText(40),
    // Shared optional ورق-dimensions / نبشی-thickness text — see the
    // create route. Nullable so clearing the box actually clears the column.
    dimensions: z
      .string()
      .trim()
      .max(40)
      .nullable()
      .optional()
      .transform((v) => (v ? normalizeSizeText(v) : v === '' ? null : v)),
    // «رده» — see the create route. Nullable so clearing the box actually
    // clears the column instead of silently leaving it.
    schedule: z
      .string()
      .trim()
      .max(40)
      .nullable()
      .optional()
      .transform((v) => (v ? normalizeSizeText(v) : v === '' ? null : v)),
    factory: optionalPersianText(80),
    // See the create route — never nullable, there is no "clear it" state
    // distinct from ranking it back to 0.
    order: z.number().int().nonnegative().max(10_000).optional(),
    theoreticalWeightKg: finiteNumber.positive().max(100_000).nullable().optional(),
    unit: z.enum(PRICE_UNIT_VALUES).optional(),
    // «مبنای قیمت». Absent leaves the column alone — never sent as null: the
    // column is NOT NULL with a `'kg'` default and "no basis" is not a state a
    // priced row is allowed to be in.
    priceBasis: z.enum(PRICE_BASIS_VALUES).optional(),
    // «طول شاخه» in metres. 100 m is past any mill branch; a nullable field so
    // an emptied box really clears it (see the nullable-vs-optional note above).
    branchLengthM: finiteNumber.positive().max(100).nullable().optional(),
    imageUrl: uploadPathSchema.nullable().optional(),
    crossListedCategoryIds: z.array(z.string().min(1)).max(5).nullable().optional(),
    // Moving a product between sub-categories was impossible: a mis-filed SKU
    // could only be retired and rebuilt — and the global unique slug meant the
    // rebuild got a worse URL and orphaned its price history. The repo derives
    // `categoryId` from this, so the pair can never disagree.
    subCategoryId: z.string().min(1).optional(),
    isActive: z.boolean().optional(),
  }),
);

/** Full public path of a SKU, for the redirect a slug change needs. */
async function skuPath(categoryId: string, subCategoryId: string, slug: string): Promise<string | null> {
  const rows = await getDb()
    .select({ catSlug: categories.slug, subSlug: subCategories.slug })
    .from(subCategories)
    .innerJoin(categories, eq(categories.id, categoryId))
    .where(eq(subCategories.id, subCategoryId))
    .limit(1);
  const hit = rows[0];
  return hit ? routes.sku(hit.catSlug, hit.subSlug, slug) : null;
}

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
    result = await updateSku(id, v.data);
  } catch (err) {
    const mapped = catalogErrorResponse(err);
    if (mapped) return mapped;
    throw err;
  }
  if (!result) return NextResponse.json({ error: 'not_found', message: 'محصول یافت نشد.' }, { status: 404 });
  await audit(auth.session.id, 'catalog.sku.update', { type: 'sku', id }, result.before, result.after);
  // A slug edit (or a move) changes the public URL; without a redirect every
  // indexed page and every customer bookmark hard-404s with no SEO transfer.
  const slugChanged = Boolean(v.data.slug && v.data.slug !== result.before.slug);
  const moved = result.before.subCategoryId !== result.after.subCategoryId;
  if (slugChanged || moved) {
    const [from, to] = await Promise.all([
      skuPath(result.before.categoryId, result.before.subCategoryId, result.before.slug),
      skuPath(result.after.categoryId, result.after.subCategoryId, result.after.slug),
    ]);
    if (from && to) await redirectOnSlugChange(from, to);
  }
  await revalidateCatalog('sku');
  return NextResponse.json({ sku: result.after });
}

/** DELETE = soft-delete; priced SKUs keep their history forever. */
async function DELETEImpl(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'catalog:write');
  if ('response' in auth) return auth.response;
  const { id } = await ctx.params;
  const result = await updateSku(id, { isActive: false });
  if (!result) return NextResponse.json({ error: 'not_found', message: 'محصول یافت نشد.' }, { status: 404 });
  await audit(
    auth.session.id,
    'catalog.sku.deactivate',
    { type: 'sku', id },
    { name: result.before.name, slug: result.before.slug, isActive: result.before.isActive },
    { isActive: false },
  );
  // Without this the product kept serving a 200 page at a live price for the
  // full ISR window after being delisted.
  await revalidateCatalog('sku');
  return NextResponse.json({ ok: true });
}

export const PATCH = withApiErrorHandling(PATCHImpl);
export const DELETE = withApiErrorHandling(DELETEImpl);

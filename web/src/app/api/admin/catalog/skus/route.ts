import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { adminListSkus, createSku } from '@/lib/server/repos/catalogAdminRepo';
import {
  catalogErrorResponse,
  clearRedirectShadow,
  revalidateCatalog,
  skuPublicPath,
} from '@/lib/server/utils/catalogRoute';
import { finiteNumber, slugSchema, uploadPathSchema } from '@/lib/validation/utils';
import { normalizeCatalogSize, normalizeCatalogText } from '@/lib/server/utils/persianZwnj';
import { toPersianDigits } from '@/lib/utils/format';
import { PRICE_BASIS_VALUES, PRICE_UNIT_VALUES } from '@/lib/types/domain';

async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'catalog:read');
  if ('response' in auth) return auth.response;
  const p = req.nextUrl.searchParams;
  const result = await adminListSkus({
    categoryId: p.get('categoryId') ?? undefined,
    subCategoryId: p.get('subCategoryId') ?? undefined,
    q: p.get('q') ?? undefined,
    // `Number('1e400')` is Infinity, which reached OFFSET and made Postgres
    // reject the statement outright; the repo now clamps, this just parses.
    page: Number(p.get('page') ?? 1),
    perPage: p.get('perPage') ? Number(p.get('perPage')) : undefined,
  });
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}

/** Free text an admin types or pastes gets normalized on the way in: Arabic
 *  ك/ي are visually identical to Persian ک/ی but never ILIKE-match them, so a
 *  name saved from an Excel paste becomes permanently unsearchable. */
const persianText = (max: number) => z.string().trim().min(1).max(max).transform(normalizeCatalogText);
const optionalPersianText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v ? normalizeCatalogText(v) : v === '' ? null : v));

const createPayload = z.object({
  // `categoryId` is deliberately absent: it is fully determined by the
  // sub-category, and accepting both only created a way for them to disagree
  // (a live product page under a breadcrumb path that 404s).
  subCategoryId: z.string().min(1),
  slug: slugSchema(120),
  // Latin digits (typed directly, or from an OS/keyboard whose numeral
  // setting silently outputs 0-9 even on a Persian layout) would otherwise
  // sit next to the Persian digits normalizeSizeText already forces onto
  // size/dimensions, splitting one product across two digit scripts.
  name: persianText(160).transform(toPersianDigits),
  standard: optionalPersianText(40),
  size: z
    .string()
    .trim()
    .max(40)
    .nullable()
    .optional()
    .transform((v) => (v ? normalizeCatalogSize(v) : v === '' ? null : v)),
  grade: optionalPersianText(40),
  // Product form/finish, deliberately independent of metallurgical `grade`.
  // Both can be present on one row (aluminium sheet is the motivating case).
  condition: optionalPersianText(40),
  // Shared optional ورق-dimensions / نبشی-thickness text. The admin
  // UI owns the exact category/sub allow-list; the API passes it through
  // generically and normalizes it like `size`, preserving existing sheet
  // inputs such as «1000x2000» → «۱۰۰۰×۲۰۰۰» unchanged.
  dimensions: z
    .string()
    .trim()
    .max(40)
    .nullable()
    .optional()
    .transform((v) => (v ? normalizeCatalogSize(v) : v === '' ? null : v)),
  // «رده» — the pipe schedule. لوله's pressure-pipe subs only (the admin form
  // offers it nowhere else). Through normalizeSizeText like `size`, so a «40»
  // typed on a Latin keypad and a «۴۰» typed on a Persian one are one value
  // in the picker rather than two lookalikes.
  schedule: z
    .string()
    .trim()
    .max(40)
    .nullable()
    .optional()
    .transform((v) => (v ? normalizeCatalogSize(v) : v === '' ? null : v)),
  factory: optionalPersianText(80),
  // Admin-chosen position within this SKU's own factory-grouped section on
  // the public price page. Absent leaves the column at its `0` ("unranked")
  // default — never nullable, unlike the free-text fields above: there is no
  // "clear it" state distinct from ranking it back to 0.
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
});

async function POSTImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'catalog:write');
  if ('response' in auth) return auth.response;
  const v = await validateBody(req, createPayload);
  if (!v.ok) return v.response;
  let sku;
  try {
    sku = await createSku(v.data);
  } catch (err) {
    const mapped = catalogErrorResponse(err);
    if (mapped) return mapped;
    throw err;
  }
  // The ROW, not the request body. `v.data.slug` is what the client asked for;
  // `sku.slug` is what exists, and `freeSlug` may have made it `…-2`. The body
  // also has no `categoryId` (derived from the sub) and no sanitized
  // `crossListedCategoryIds` — so the activity log showed a product that was
  // never in the database, which is the same log the delete entry expects to
  // be reconstructible from.
  await audit(auth.session.id, 'catalog.sku.create', { type: 'sku', id: sku.id }, null, sku);
  // A SKU slug is globally unique, so recreating a deleted product reuses its
  // exact old URL — the one its own delete left a tombstone on. See
  // `clearRedirectShadow`.
  await clearRedirectShadow([await skuPublicPath(sku.categoryId, sku.subCategoryId, sku.slug)]);
  // The SKU routes used to revalidate NOTHING while the taxonomy routes
  // revalidated the world — a new product stayed invisible for the full
  // 5-minute ISR window.
  await revalidateCatalog('sku');
  return NextResponse.json({ sku }, { status: 201 });
}

export const GET = withApiErrorHandling(GETImpl);
export const POST = withApiErrorHandling(POSTImpl);

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { adminListSkus, createSku } from '@/lib/server/repos/catalogAdminRepo';
import { catalogErrorResponse, revalidateCatalog } from '@/lib/server/utils/catalogRoute';
import { finiteNumber, slugSchema, uploadPathSchema } from '@/lib/validation/utils';
import { normalizePersian, normalizeSizeText } from '@/lib/utils/persianText';

async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'catalog:read');
  if ('response' in auth) return auth.response;
  const p = req.nextUrl.searchParams;
  const statusParam = p.get('status');
  const result = await adminListSkus({
    categoryId: p.get('categoryId') ?? undefined,
    subCategoryId: p.get('subCategoryId') ?? undefined,
    q: p.get('q') ?? undefined,
    status: statusParam === 'active' || statusParam === 'inactive' ? statusParam : undefined,
    visibility: p.get('visibility') === 'hidden' ? 'hidden' : undefined,
    includeInactive: p.get('all') === 'true',
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
const persianText = (max: number) => z.string().trim().min(1).max(max).transform(normalizePersian);
const optionalPersianText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v ? normalizePersian(v) : v === '' ? null : v));

const createPayload = z.object({
  // `categoryId` is deliberately absent: it is fully determined by the
  // sub-category, and accepting both only created a way for them to disagree
  // (a live product page under a breadcrumb path that 404s).
  subCategoryId: z.string().min(1),
  slug: slugSchema(120),
  name: persianText(160),
  standard: optionalPersianText(40),
  size: z
    .string()
    .trim()
    .max(40)
    .nullable()
    .optional()
    .transform((v) => (v ? normalizeSizeText(v) : v === '' ? null : v)),
  grade: optionalPersianText(40),
  factory: optionalPersianText(80),
  theoreticalWeightKg: finiteNumber.positive().max(100_000).nullable().optional(),
  unit: z.enum(['kg', 'branch', 'sheet', 'meter']).optional(),
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
  await audit(auth.session.id, 'catalog.sku.create', { type: 'sku', id: sku.id }, null, v.data);
  // The SKU routes used to revalidate NOTHING while the taxonomy routes
  // revalidated the world — a new product stayed invisible for the full
  // 5-minute ISR window.
  await revalidateCatalog('sku');
  return NextResponse.json({ sku }, { status: 201 });
}

export const GET = withApiErrorHandling(GETImpl);
export const POST = withApiErrorHandling(POSTImpl);

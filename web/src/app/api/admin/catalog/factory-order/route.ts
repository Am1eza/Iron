import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { factoriesForCategory, setFactoryOrder } from '@/lib/server/repos/catalogAdminRepo';
import { catalogErrorResponse, revalidateCatalog } from '@/lib/server/utils/catalogRoute';
import { normalizeCatalogText } from '@/lib/server/utils/persianZwnj';

/**
 * The admin-chosen order of the «بر اساس کارخانه» sections on a category's
 * price page (US-18.2).
 *
 * Scoped per category, always: `categoryId` is required on both verbs, because
 * an unscoped read would return one flat list the admin could not act on and
 * an unscoped write has no meaning at all — which mills lead is a
 * per-product-line fact (فولاد مبارکه leads ورق and does not exist in میلگرد).
 */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'catalog:read');
  if ('response' in auth) return auth.response;
  const categoryId = req.nextUrl.searchParams.get('categoryId');
  if (!categoryId) {
    return NextResponse.json(
      { error: 'category_required', message: 'دسته را مشخص کنید.' },
      { status: 400 },
    );
  }
  return NextResponse.json(
    { categoryId, factories: await factoriesForCategory(categoryId) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

const putPayload = z.object({
  categoryId: z.string().trim().min(1).max(40),
  /**
   * The COMPLETE ordered list, not a delta — the server replaces the
   * category's rows with exactly this (see setFactoryOrder). Capped well
   * above the largest real category (میلگرد carries 18 mills) so a malformed
   * client can't ask for an unbounded insert.
   *
   * Normalized the same way `skus.factory` is on the product form: without it
   * a name typed with a different ZWNJ/Arabic-yeh spelling here would be
   * stored as a row that can never match the SKUs it is meant to order.
   *
   * `.min(1)`: `setFactoryOrder` DELETEs before it inserts, so an empty array
   * silently wiped the whole category's hand-arranged order — 18 mills for
   * میلگرد — and answered `{ ok: true, count: 0 }`, which no client checks.
   * A PUT that says nothing is a client bug (a submit against state that had
   * not loaded), not an instruction to clear; there is no UI for clearing, and
   * deleting the category is what actually removes these rows.
   */
  factories: z
    .array(z.string().trim().min(1).max(80).transform(normalizeCatalogText))
    .min(1, 'فهرست کارخانه‌ها نمی‌تواند خالی باشد.')
    .max(200),
});

async function PUTImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'catalog:write');
  if ('response' in auth) return auth.response;
  const v = await validateBody(req, putPayload);
  if (!v.ok) return v.response;
  const before = await factoriesForCategory(v.data.categoryId);
  // The only one of the six catalog routes that had no error mapping: a stale
  // `categoryId` hit the `factory_order` FK and came back as a bare 500 with
  // no code the panel could branch on. `setFactoryOrder` now checks the parent
  // and raises `InvalidParentError`, which is a 400 the form can render.
  let count;
  try {
    count = await setFactoryOrder(v.data.categoryId, v.data.factories);
  } catch (err) {
    const mapped = catalogErrorResponse(err);
    if (mapped) return mapped;
    throw err;
  }
  await audit(
    auth.session.id,
    'catalog.factoryOrder.set',
    { type: 'category', id: v.data.categoryId },
    // The names, in order, on both sides — the whole point of the entry is to
    // answer "what did the list look like before?" so a bad drag is undoable.
    { factories: before.filter((f) => f.order !== null).map((f) => f.factory) },
    { factories: v.data.factories },
  );
  // 'sku' scope, not 'taxonomy': this changes the price pages and the home
  // cascade, but not the nav, the mega-menu, or the AI advisor's grounding
  // facts — none of which know a factory exists. Paying for the root-layout
  // purge and the Redis round trip here would be pure cost.
  await revalidateCatalog('sku');
  return NextResponse.json({ ok: true, count });
}

export const GET = withApiErrorHandling(GETImpl);
export const PUT = withApiErrorHandling(PUTImpl);

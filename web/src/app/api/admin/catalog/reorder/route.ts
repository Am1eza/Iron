import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { reorderTaxonomy } from '@/lib/server/repos/catalogAdminRepo';
import { revalidateCatalog } from '@/lib/server/utils/catalogRoute';
import { finiteNumber } from '@/lib/validation/utils';

/**
 * Reorder a whole taxonomy list in one request (US-18.2).
 *
 * The rail used to save a drag as N parallel PATCHes built from a client-side
 * snapshot, which is three separate problems: two admins arranging the same
 * list interleave into an order neither of them chose; a partial failure
 * publishes duplicate or gapped `order` values to the public nav with no way
 * to tell which half landed; and each PATCH separately writes an audit row and
 * purges the root layout, so moving one row in a list of 18 costs 18 of each.
 * `reorderTaxonomy` — one transaction, written for exactly this — already
 * existed and no route exported it.
 *
 * The COMPLETE list of the nodes being arranged, not a delta: positions are
 * only meaningful relative to their neighbours, and a two-row delta against a
 * list somebody else has since changed is how the interleaving happened.
 */
const putPayload = z.object({
  kind: z.enum(['category', 'subCategory']),
  /** Required for `subCategory` — the category whose children are being
   *  arranged. It is what the audit entry is filed under, so the activity log
   *  can answer "who rearranged ورق, and what was it before?". */
  categoryId: z.string().trim().min(1).max(60).optional(),
  items: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(60),
        order: finiteNumber.int().min(0).max(9999),
      }),
    )
    .min(1)
    .max(500)
    .refine((items) => new Set(items.map((i) => i.id)).size === items.length, {
      message: 'هر ردیف فقط یک بار می‌تواند در فهرست ترتیب بیاید.',
    }),
});

async function PUTImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'catalog:write');
  if ('response' in auth) return auth.response;
  const v = await validateBody(req, putPayload);
  if (!v.ok) return v.response;
  if (v.data.kind === 'subCategory' && !v.data.categoryId) {
    return NextResponse.json(
      { error: 'category_required', message: 'دسته را مشخص کنید.', fields: { categoryId: 'دسته را مشخص کنید.' } },
      { status: 400 },
    );
  }
  const result = await reorderTaxonomy(v.data.kind, v.data.items, v.data.categoryId);
  await audit(
    auth.session.id,
    'catalog.taxonomy.reorder',
    // One entry for the whole operation. A category-list reorder has no single
    // node it belongs to — `taxonomy` is that list itself — while a
    // sub-category reorder is filed under the category it happened inside.
    { type: 'category', id: v.data.categoryId ?? 'taxonomy' },
    { kind: v.data.kind, items: result.before },
    { kind: v.data.kind, items: result.after },
  );
  // ONE purge for the whole drag, where the old client did one per row.
  await revalidateCatalog('taxonomy');
  return NextResponse.json({ ok: true, count: result.after.length });
}

export const PUT = withApiErrorHandling(PUTImpl);

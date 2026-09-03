import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, audit, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { deleteSkusBulk, skuIdsWithOpenOrders } from '@/lib/server/repos/catalogAdminRepo';
import { planDeletedNodeRedirects, revalidateCatalog, writeCatalogRedirects } from '@/lib/server/utils/catalogRoute';

const MAX_BULK_DELETE = 200;

const payload = z.object({
  ids: z.array(z.string().min(1)).min(1).max(MAX_BULK_DELETE),
});

/**
 * Bulk delete, done for real: one transaction instead of N independent
 * `DELETE` requests, and the same open-order guard a single delete gets — not
 * skipped, the way the client-side `Promise.allSettled` loop skipped it
 * entirely. A partial network failure used to leave an arbitrary split of
 * "gone" and "still there"; a batch that includes a product on an open order
 * used to just delete it anyway.
 *
 * All-or-nothing on the open-order check: if ANY id in the batch is blocked
 * and the caller didn't pass `override`, the whole batch is rejected so the
 * admin can see exactly which ones and decide, rather than half the
 * selection disappearing silently around the blocked ones.
 */
async function POSTImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'catalog:write');
  if ('response' in auth) return auth.response;
  const v = await validateBody(req, payload);
  if (!v.ok) return v.response;
  const ids = [...new Set(v.data.ids)];

  const override = req.nextUrl.searchParams.get('override') === 'true';
  if (!override) {
    const blockedIds = await skuIdsWithOpenOrders(ids);
    if (blockedIds.length > 0) {
      return NextResponse.json(
        {
          error: 'open_orders',
          message: `${blockedIds.length} کالا سفارش باز دارد. برای حذف قطعی، درخواست را با override=true دوباره بفرست.`,
          blockedIds,
        },
        { status: 409 },
      );
    }
  }

  // Tombstones read the parent slugs, which only exist before the delete.
  const tombstoneLists = await Promise.all(ids.map((id) => planDeletedNodeRedirects('sku', id)));
  const removed = await deleteSkusBulk(ids);
  if (removed.length === 0) {
    return NextResponse.json({ error: 'not_found', message: 'هیچ‌کدام از کالاها یافت نشد.' }, { status: 404 });
  }
  const removedIds = new Set(removed.map((r) => r.id));

  await audit(
    auth.session.id,
    'catalog.sku.bulkDelete',
    { type: 'sku', id: `bulk:${removed[0]!.id}` },
    { count: removed.length, items: removed },
    null,
  );
  await writeCatalogRedirects(tombstoneLists.filter((_l, i) => removedIds.has(ids[i]!)).flat());
  await revalidateCatalog('sku');

  const notFoundIds = ids.filter((id) => !removedIds.has(id));
  return NextResponse.json({ ok: true, removedCount: removed.length, notFoundIds });
}

export const POST = withApiErrorHandling(POSTImpl);

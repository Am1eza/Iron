import { NextResponse, type NextRequest, after } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { safeRevalidatePath } from '@/lib/server/utils/revalidate';
import { tableRows } from '@/lib/server/repos/catalogRepo';
import { savePrices, type SavePriceInput, type SavePricesRowResult } from '@/lib/server/services/pricing.service';
import { evaluateAlerts } from '@/lib/server/services/alerts.service';
import { reportError } from '@/lib/errors/report';
import { finiteNumber } from '@/lib/validation/utils';

/** GET /api/admin/pricing?cat=&sub= — the daily grid (rows incl. stale flags). */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'pricing:write');
  if ('response' in auth) return auth.response;
  const cat = req.nextUrl.searchParams.get('cat') ?? 'rebar';
  const sub = req.nextUrl.searchParams.get('sub') ?? undefined;
  const rows = await tableRows(cat, sub || undefined);
  return NextResponse.json({ rows }, { headers: { 'Cache-Control': 'no-store' } });
}

// Price ceiling: 1e13 Toman — far above any real per-unit steel price,
// comfortably below the JS safe-integer range (2^53 ≈ 9e15).
const rowSchema = z.object({
  skuId: z.string().min(1).max(120),
  price: finiteNumber.positive().max(1e13),
  deliveryTime: z.string().trim().max(40).optional(),
  vatIncluded: z.boolean().optional(),
});
// The envelope is validated loosely on purpose — `prices` must be an array
// of 1-500 items, but each ITEM is validated individually below, not here.
// W23 review fix: this used to validate every row through one big
// `z.array(rowSchema)`, so a SINGLE bad field anywhere (e.g. one
// deliveryTime over 40 chars) failed the whole request with a 400 before
// `savePrices` — which has real per-row fault isolation — ever ran, wiping
// out an entire correctly-typed batch. That directly contradicted this
// route's own doc comment below.
const bulkPayload = z.object({
  prices: z.array(z.unknown()).min(1).max(500),
});

/**
 * PUT /api/admin/pricing — bulk daily save (movement + history + audit per
 * row), with per-row fault isolation: a bad row is reported, not silently
 * dropped, and every other row still commits.
 */
async function PUTImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'pricing:write');
  if ('response' in auth) return auth.response;
  const v = await validateBody(req, bulkPayload);
  if (!v.ok) return v.response;

  // Per-row schema validation (see the `bulkPayload` comment above) — a row
  // that fails its OWN schema is reported in the exact same
  // `SavePricesRowResult` shape a runtime save failure would use, so the
  // client can't tell (and doesn't need to) which layer rejected it. Only
  // schema-VALID rows reach `savePrices`, in original order.
  const results: SavePricesRowResult[] = new Array(v.data.prices.length);
  const validInputs: { input: SavePriceInput; index: number }[] = [];
  v.data.prices.forEach((raw, i) => {
    const parsed = rowSchema.safeParse(raw);
    if (parsed.success) {
      validInputs.push({ input: parsed.data, index: i });
    } else {
      const rawSkuId = (raw as Record<string, unknown> | null)?.skuId;
      results[i] = {
        ok: false,
        skuId: typeof rawSkuId === 'string' ? rawSkuId : 'نامشخص',
        error: parsed.error.issues[0]?.message ?? 'ورودی نامعتبر است.',
      };
    }
  });
  const saved = await savePrices(auth.session.id, validInputs.map((x) => x.input));
  validInputs.forEach(({ index }, j) => {
    results[index] = saved[j]!;
  });
  const failed = results.filter((r) => !r.ok);
  // W23 review fix: a bare `void promise.catch(...)` is not guaranteed to
  // run to completion on this app's actual production target (Cloudflare
  // Workers) — the isolate can be torn down once the response is sent,
  // silently cutting off alert evaluation triggered by this very save (see
  // db/client.ts's own detailed comment on why `after()`/`ctx.waitUntil()`
  // is required for exactly this class of background work on Workers).
  after(() => evaluateAlerts().catch((err) => reportError(err, { route: 'admin/pricing', stage: 'evaluateAlerts' })));
  // The /prices ISR pages now cache for up to 5 minutes (see [category]/[sub]/[sku]
  // page.tsx `revalidate`) — bust the whole subtree on any successful save so an
  // admin price edit shows up immediately instead of waiting out the window.
  // Home also reads the same rows (PriceBoard) but sits OUTSIDE the /prices
  // subtree, so it needs its own explicit bust (W23 — was previously left to
  // its own 300s ISR window, up to 5 minutes of drift between the two pages
  // showing a different number for the same SKU at the same moment).
  if (failed.length < results.length) {
    safeRevalidatePath('/prices', 'layout');
    safeRevalidatePath('/', 'page');
  }
  return NextResponse.json(
    { results, saved: results.length - failed.length, failed: failed.length },
    { status: failed.length > 0 && failed.length === results.length ? 422 : 200 },
  );
}

export const GET = withApiErrorHandling(GETImpl);
export const PUT = withApiErrorHandling(PUTImpl);

/**
 * Pricing writes — THE single write path for prices (admin grid, bulk save,
 * AI/admin tools). One transaction: lock row → compute movement → upsert
 * current_prices → append price_points → audit. (acceptance-criteria §B2)
 */
import { desc, eq, inArray, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import { getDb, type DbOrTx } from '@/lib/server/db/client';
import { currentPrices, pricePoints, skus, auditEntries } from '@/lib/server/db/schema';
import type { PriceUnit } from '@/lib/types/domain';
import { isSameJalaliDay } from '@/lib/server/utils/jalali';
import { reportError } from '@/lib/errors/report';

export interface SavePriceInput {
  skuId: string;
  price: number; // Toman, excl. VAT
  unit?: PriceUnit;
  deliveryTime?: string;
  vatIncluded?: boolean;
}

export interface SavePriceResult {
  skuId: string;
  price: number;
  movementPct: number | null;
  movementDir: 'up' | 'down' | 'flat';
}

export class InvalidPriceError extends Error {}

/** A bulk row naming a SKU that does not exist. Its own class so savePrices
 *  can answer it specifically instead of matching on message text. */
export class SkuNotFoundError extends Error {}

/** The most recent `price_points` row for this SKU from a DIFFERENT Jalali
 *  day than `now` — the correct "yesterday's close" baseline for movement%
 *  (W23 review fix; see the comment at its call site for why `prev.price`
 *  alone isn't). 30 rows is comfortably more than any realistic number of
 *  same-day re-saves; the index is on (sku_id, at) so this stays cheap even
 *  for a SKU with years of history. */
async function lastDifferentDayPrice(tx: DbOrTx, skuId: string, now: Date): Promise<number | null> {
  const rows = await tx
    .select({ price: pricePoints.price, at: pricePoints.at })
    .from(pricePoints)
    .where(eq(pricePoints.skuId, skuId))
    .orderBy(desc(pricePoints.at))
    .limit(30);
  return rows.find((r) => !isSameJalaliDay(r.at, now))?.price ?? null;
}

/**
 * Save one price (in an existing transaction when part of a bulk save).
 *
 * `actorId` is nullable because the automated price mirror (US-02.5) has no
 * staff account behind it. Both columns it lands in already model that:
 * `current_prices.updated_by` is nullable, and `audit_entries.actor_id`
 * documents null as "system job". A synthetic user row would have been the
 * alternative and would read as a person in every «چه کسی» column in the
 * panel — which is exactly the fact the owner needs to see at a glance.
 */
export async function savePrice(actorId: string | null, input: SavePriceInput): Promise<SavePriceResult> {
  // W23 review fix: `bulkPayload` at the route layer is the only validation
  // this function could previously rely on — this is documented as also
  // serving "AI/admin tools" as a direct callsite, which wouldn't go through
  // that route at all. A non-finite/non-positive price must never reach a
  // customer-facing price table regardless of caller.
  if (!Number.isFinite(input.price) || input.price <= 0) {
    throw new InvalidPriceError(`invalid price for ${input.skuId}: ${input.price}`);
  }

  const db = getDb();
  return db.transaction(async (tx) => {
    // A brand-new SKU has no `current_prices` row yet, so `SELECT ... FOR
    // UPDATE` below has nothing to lock — two concurrent first-time saves
    // could both read `prev = null` and both compute movement as if no
    // price existed, regardless of commit order. The advisory lock
    // serializes access to this SKU's price unconditionally, whether or not
    // a row exists yet, closing that race.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'price:' + input.skuId}))`);

    const skuRows = await tx.select().from(skus).where(eq(skus.id, input.skuId)).limit(1);
    const sku = skuRows[0];
    if (!sku) throw new SkuNotFoundError(`SKU not found: ${input.skuId}`);

    const prevRows = await tx.select().from(currentPrices).where(eq(currentPrices.skuId, input.skuId));
    const prev = prevRows[0] ?? null;

    const price = Math.round(input.price);
    const now = new Date();
    let movementPct: number | null = null;
    let movementDir: 'up' | 'down' | 'flat' = 'flat';
    if (prev && prev.price > 0) {
      // W23 review fix: movement% used to always diff against `prev.price`
      // (whatever was last saved, even minutes ago) — a same-day correction
      // (fixing a typo) silently overwrote the real day-over-day نوسان
      // customers see with the size of the correction itself. When the last
      // save was ALSO today, walk price_points back to the last save from a
      // genuinely earlier day and diff against that instead; price_points
      // itself is unaffected either way (append-only, every save recorded).
      const baseline = isSameJalaliDay(prev.updatedAt, now) ? await lastDifferentDayPrice(tx, input.skuId, now) : prev.price;
      if (baseline != null && baseline > 0) {
        movementPct = Math.round(((price - baseline) / baseline) * 10000) / 100;
        movementDir = movementPct > 0.05 ? 'up' : movementPct < -0.05 ? 'down' : 'flat';
      }
    }

    // W23 review fix: `sku.unit` (the catalog's canonical unit) is now
    // always authoritative unless this call explicitly overrides it —
    // `prev?.unit` used to win, so correcting a SKU's unit in the catalog
    // (PATCH /api/admin/catalog/skus/{id}) never propagated to its price
    // row, and every display/export/estimate kept reading the stale unit
    // indefinitely (there was no UI path to fix it short of a direct DB
    // write).
    const unit = input.unit ?? sku.unit;
    // Same rule, same reason, for the DENOMINATION: the catalog's SKU is
    // authoritative, so a price typed into the grid is stamped with what that
    // product is currently sold by. Without this a price row saved before the
    // SKU was corrected would keep asserting «per kilogram» forever, and
    // `toPriceRow` prefers the price row's copy.
    const priceBasis = sku.priceBasis;
    // An EMPTY deliveryTime means "no opinion", never "erase the promise".
    // `?? prev` alone only covered undefined, and the admin grid submits this
    // field on every dirty row — reading it back from a row whose price was
    // stale-HIDDEN, where the public DTO withholds it as `''`. So a routine
    // daily price save silently overwrote «۴۸ ساعت» with an empty string on
    // every row it touched, wiping the delivery-time promise the whole
    // product is built on. Guarded here rather than at the route because this
    // function is documented as also serving AI/admin tools directly.
    const deliveryTime = input.deliveryTime?.trim() || prev?.deliveryTime || '۲۴ ساعت';
    const vatIncluded = input.vatIncluded ?? prev?.vatIncluded ?? false;
    await tx
      .insert(currentPrices)
      .values({
        skuId: input.skuId,
        price,
        unit,
        priceBasis,
        deliveryTime,
        vatIncluded,
        movementPct,
        movementDir,
        updatedAt: now,
        updatedBy: actorId,
        isStale: false,
      })
      .onConflictDoUpdate({
        target: currentPrices.skuId,
        set: { price, unit, priceBasis, deliveryTime, vatIncluded, movementPct, movementDir, updatedAt: now, updatedBy: actorId, isStale: false },
      });

    // Append-only history — every save (spec: HISTORY_RETENTION unlimited).
    await tx.insert(pricePoints).values({ id: ulid(), skuId: input.skuId, price, unit, priceBasis, at: now });

    await tx.insert(auditEntries).values({
      id: ulid(),
      actorId,
      action: 'price.update',
      entityType: 'sku',
      entityId: input.skuId,
      // W23 review fix: `vatIncluded` is a real, saveable field on this same
      // write — omitting it from the diff meant a VAT-inclusion flip left
      // zero audit trail even though FIELD_LABEL.vatIncluded already exists
      // in auditVocab.ts specifically to render it.
      before: prev ? { price: prev.price, unit: prev.unit, deliveryTime: prev.deliveryTime, vatIncluded: prev.vatIncluded } : null,
      after: { price, unit, deliveryTime, vatIncluded },
    });

    return { skuId: input.skuId, price, movementPct, movementDir };
  });
}

export type SavePricesRowResult =
  | ({ ok: true } & SavePriceResult)
  | { ok: false; skuId: string; error: string };

// Bulk saves can carry up to 500 rows (validated at the route). Each row is
// its own transaction (independent SKUs — no reason to serialize them), so we
// run a bounded number concurrently rather than one at a time; 500 sequential
// round trips (each 5+ queries) inside one HTTP request risked hitting
// platform request-duration limits, especially on the Cloudflare Workers
// deploy target. Stays comfortably under the per-request pg Pool's `max`
// (15 on Node, 5 on Workers — see db/client.ts) so this can't itself exhaust
// the pool.
const BULK_SAVE_CONCURRENCY = 5;

/**
 * Bulk daily grid save — bounded-concurrency per-row transactions with
 * per-row fault isolation. A bad row (e.g. an unknown skuId) is reported and
 * skipped; every other row still commits — nothing is silently dropped
 * (EC-M1.3: "bulk import with some invalid rows imports valid rows and
 * reports the failures"). Results are returned in the same order as `inputs`.
 */
export async function savePrices(
  actorId: string | null,
  inputs: SavePriceInput[],
): Promise<SavePricesRowResult[]> {
  const out: SavePricesRowResult[] = new Array(inputs.length);
  const runOne = async (input: SavePriceInput, index: number) => {
    try {
      const result = await savePrice(actorId, input);
      out[index] = { ok: true, ...result };
    } catch (err) {
      // Only messages this code wrote itself may reach the client. Returning
      // err.message verbatim handed the admin UI whatever the failure
      // happened to be — a Postgres error carries SQL text, column and
      // constraint names, and a connection failure carries the DSN's host.
      // Anything unrecognised is reported server-side and answered generically.
      let error: string;
      if (err instanceof InvalidPriceError) {
        error = 'قیمت واردشده معتبر نیست.';
      } else if (err instanceof SkuNotFoundError) {
        error = 'کالا یافت نشد.';
      } else {
        reportError(err, { scope: 'savePrices', skuId: input.skuId });
        error = 'ذخیره ناموفق بود.';
      }
      out[index] = { ok: false, skuId: input.skuId, error };
    }
  };
  for (let i = 0; i < inputs.length; i += BULK_SAVE_CONCURRENCY) {
    const chunk = inputs.slice(i, i + BULK_SAVE_CONCURRENCY);
    await Promise.all(chunk.map((input, j) => runOne(input, i + j)));
  }
  return out;
}

/** Staleness job body — flags prices not updated within the current Jalali day. */
export async function recomputeStaleness(): Promise<number> {
  const db = getDb();
  const now = new Date();
  const fresh = await db
    .select({ skuId: currentPrices.skuId, updatedAt: currentPrices.updatedAt })
    .from(currentPrices)
    .where(eq(currentPrices.isStale, false));
  const toFlag = fresh.filter((r) => !isSameJalaliDay(r.updatedAt, now)).map((r) => r.skuId);
  if (toFlag.length === 0) return 0;
  await db.update(currentPrices).set({ isStale: true }).where(inArray(currentPrices.skuId, toFlag));
  return toFlag.length;
}

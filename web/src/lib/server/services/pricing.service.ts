/**
 * Pricing writes — THE single write path for prices (admin grid, bulk save,
 * AI/admin tools). One transaction: lock row → compute movement → upsert
 * current_prices → append price_points → audit. (acceptance-criteria §B2)
 */
import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import { getDb, type DbOrTx } from '@/lib/server/db/client';
import { currentPrices, pricePoints, priceSyncEntries, skus, auditEntries } from '@/lib/server/db/schema';
import type { PriceBasis, PriceUnit } from '@/lib/types/domain';
import { isSameJalaliDay, TEHRAN_OFFSET_MS } from '@/lib/server/utils/jalali';
import { reportError } from '@/lib/errors/report';
import { isValidPriceToman } from '@/lib/utils/priceValidation';

export interface SavePriceInput {
  skuId: string;
  price: number; // Toman, excl. VAT
  unit?: PriceUnit;
  deliveryTime?: string;
  vatIncluded?: boolean;
  /**
   * This price is the automated mirror's NEAREST-ANALOG estimate rather than a
   * published price for this exact product (US-05.3).
   *
   * Defaults to FALSE on every save, and that default is the point: a human
   * typing a price into the admin grid, or an exact mirror write, is precisely
   * the act of replacing an estimate with a real number, so the flag has to
   * clear itself without any caller having to remember to clear it.
   */
  isEstimated?: boolean;
  /** Recheck under the SKU row lock, not only before a slow source fetch. */
  respectSyncExclusion?: boolean;
  /** Stable identity of one upstream observation; retries become no-ops. */
  sourceEventKey?: string;
  source?: 'admin' | 'sync:ahanonline' | 'sync:markazeahan' | 'rollback';
  sourcePublishedLabel?: string | null;
  confirmedAt?: Date;
  /** Required for an intentional >4x or <0.25x correction. */
  confirmAnomaly?: boolean;
  /** Optimistic lock for rollback/cart-sensitive administrative operations. */
  expectedCurrentVersion?: string;
  /** Sync evidence inserted in the same transaction as the price itself. */
  syncEntry?: Omit<typeof priceSyncEntries.$inferInsert, 'id' | 'outcome' | 'oldPrice' | 'newPrice' | 'appliedAt'>;
}

export interface SavePriceResult {
  skuId: string;
  price: number;
  movementPct: number | null;
  movementDir: 'up' | 'down' | 'flat';
  changed: boolean;
  version: string;
}

export class InvalidPriceError extends Error {}

/** A bulk row naming a SKU that does not exist. Its own class so savePrices
 *  can answer it specifically instead of matching on message text. */
export class SkuNotFoundError extends Error {}
export class PriceSyncExcludedError extends Error {}
export class PriceAnomalyError extends Error {}
export class PriceVersionConflictError extends Error {}

/** Last close before Tehran midnight, in the same denomination. No arbitrary
 * history window: even thousands of updates today cannot hide the baseline. */
async function lastDifferentDayPrice(tx: DbOrTx, skuId: string, now: Date, unit: PriceUnit, basis: PriceBasis): Promise<number | null> {
  const dayMs = 86_400_000;
  const midnight = new Date(Math.floor((now.getTime() + TEHRAN_OFFSET_MS) / dayMs) * dayMs - TEHRAN_OFFSET_MS);
  const rows = await tx
    .select({ price: pricePoints.price, confirmedAt: pricePoints.confirmedAt })
    .from(pricePoints)
    .where(and(eq(pricePoints.skuId, skuId), lt(pricePoints.confirmedAt, midnight), eq(pricePoints.unit, unit), eq(pricePoints.priceBasis, basis)))
    .orderBy(desc(pricePoints.confirmedAt), desc(pricePoints.at), desc(pricePoints.id))
    .limit(1);
  return rows[0]?.price ?? null;
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
  if (!isValidPriceToman(input.price)) {
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

    const skuRows = await tx.select().from(skus).where(eq(skus.id, input.skuId)).limit(1).for('update');
    const sku = skuRows[0];
    if (!sku) throw new SkuNotFoundError(`SKU not found: ${input.skuId}`);
    if (input.respectSyncExclusion && sku.priceSyncExcluded) throw new PriceSyncExcludedError('SKU excluded from sync');
    if (input.unit != null && input.unit !== sku.unit) {
      throw new InvalidPriceError('price unit must match the SKU');
    }

    const prevRows = await tx.select().from(currentPrices).where(eq(currentPrices.skuId, input.skuId));
    const prev = prevRows[0] ?? null;
    if (input.sourceEventKey) {
      const existing = await tx.select({ version: pricePoints.version }).from(pricePoints)
        .where(eq(pricePoints.sourceEventKey, input.sourceEventKey)).limit(1);
      if (existing[0]) {
        return {
          skuId: input.skuId,
          price: prev?.price ?? input.price,
          movementPct: prev?.movementPct ?? null,
          movementDir: prev?.movementDir ?? 'flat',
          changed: false,
          version: existing[0].version,
        };
      }
    }

    // A replay of the exact same source event is a successful no-op even if
    // the current version has since advanced. For a genuinely new event,
    // optimistic concurrency is still checked before any write.
    if (input.expectedCurrentVersion != null && prev?.version !== input.expectedCurrentVersion) {
      throw new PriceVersionConflictError('price changed after the operator loaded it');
    }

    const price = input.price;
    const now = new Date();
    const confirmedAt = input.confirmedAt ?? now;
    if (!Number.isFinite(confirmedAt.getTime()) || confirmedAt > now) {
      throw new InvalidPriceError('invalid price confirmation timestamp');
    }
    if (prev && (price > prev.price * 4 || price < prev.price / 4) && !input.confirmAnomaly) {
      throw new PriceAnomalyError('price change requires explicit confirmation');
    }
    const version = ulid();
    const source = input.source ?? 'admin';
    let movementPct: number | null = null;
    let movementDir: 'up' | 'down' | 'flat' = 'flat';
    if (prev && prev.price > 0 && prev.unit === sku.unit && prev.priceBasis === sku.priceBasis) {
      // W23 review fix: movement% used to always diff against `prev.price`
      // (whatever was last saved, even minutes ago) — a same-day correction
      // (fixing a typo) silently overwrote the real day-over-day نوسان
      // customers see with the size of the correction itself. When the last
      // save was ALSO today, walk price_points back to the last save from a
      // genuinely earlier day and diff against that instead; price_points
      // itself is unaffected either way (append-only, every save recorded).
      const baseline = isSameJalaliDay(prev.confirmedAt, now)
        ? await lastDifferentDayPrice(tx, input.skuId, now, sku.unit, sku.priceBasis)
        : prev.confirmedAt < now ? prev.price : null;
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
    // NOT `?? prev?.priceIsEstimated`: see the field's comment. Any save that
    // does not claim to be an estimate is asserting a real price.
    const priceIsEstimated = input.isEstimated === true;
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
        confirmedAt,
        version,
        source,
        sourceEventKey: input.sourceEventKey ?? null,
        sourcePublishedLabel: input.sourcePublishedLabel ?? null,
        updatedBy: actorId,
        isStale: false,
        priceIsEstimated,
      })
      .onConflictDoUpdate({
        target: currentPrices.skuId,
        set: { price, unit, priceBasis, deliveryTime, vatIncluded, movementPct, movementDir, updatedAt: now, confirmedAt, version, source, sourceEventKey: input.sourceEventKey ?? null, sourcePublishedLabel: input.sourcePublishedLabel ?? null, updatedBy: actorId, isStale: !isSameJalaliDay(confirmedAt, now), priceIsEstimated },
      });

    // Append-only history — every save (spec: HISTORY_RETENTION unlimited).
    await tx.insert(pricePoints).values({ id: ulid(), skuId: input.skuId, price, unit, priceBasis, at: now, confirmedAt, version, priceIsEstimated, actorId, source, sourceEventKey: input.sourceEventKey ?? null, sourcePublishedLabel: input.sourcePublishedLabel ?? null });

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
      before: prev ? { price: prev.price, unit: prev.unit, priceBasis: prev.priceBasis, priceIsEstimated: prev.priceIsEstimated, deliveryTime: prev.deliveryTime, vatIncluded: prev.vatIncluded } : null,
      after: { price, unit, priceBasis, priceIsEstimated, deliveryTime, vatIncluded },
    });
    if (input.syncEntry) {
      await tx.insert(priceSyncEntries).values({
        ...input.syncEntry,
        id: ulid(),
        outcome: 'written',
        oldPrice: prev?.price ?? null,
        newPrice: price,
        appliedAt: now,
      });
    }

    return { skuId: input.skuId, price, movementPct, movementDir, changed: true, version };
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
  const counts = new Map<string, number>();
  for (const input of inputs) counts.set(input.skuId, (counts.get(input.skuId) ?? 0) + 1);
  const runOne = async (input: SavePriceInput, index: number) => {
    if (counts.get(input.skuId)! > 1) {
      out[index] = { ok: false, skuId: input.skuId, error: 'کالا در درخواست تکرار شده است؛ هیچ قیمت تکراری ذخیره نشد.' };
      return;
    }
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
      } else if (err instanceof PriceSyncExcludedError) {
        error = 'این کالا از همگام‌سازی مستثنا شده است.';
      } else if (err instanceof PriceAnomalyError) {
        error = 'جهش غیرعادی قیمت شناسایی شد؛ عدد و واحد را بررسی و جداگانه تأیید کنید.';
      } else if (err instanceof PriceVersionConflictError) {
        error = 'قیمت در این فاصله تغییر کرده است؛ صفحه را تازه کنید.';
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

/** Compensating append: restores a historical snapshot without deleting or
 * rewriting history, and refuses to overwrite a newer current version. */
export async function rollbackPrice(actorId: string, input: {
  skuId: string;
  targetVersion: string;
  expectedCurrentVersion: string;
}): Promise<SavePriceResult> {
  const target = await getDb().select().from(pricePoints)
    .where(and(eq(pricePoints.skuId, input.skuId), eq(pricePoints.version, input.targetVersion)))
    .limit(1);
  const point = target[0];
  if (!point) throw new SkuNotFoundError('historical price not found');
  return savePrice(actorId, {
    skuId: input.skuId,
    price: point.price,
    unit: point.unit,
    isEstimated: point.priceIsEstimated,
    source: 'rollback',
    sourcePublishedLabel: point.sourcePublishedLabel,
    sourceEventKey: `rollback:${input.skuId}:${input.targetVersion}:${input.expectedCurrentVersion}`,
    expectedCurrentVersion: input.expectedCurrentVersion,
    confirmAnomaly: true,
  });
}

/** Staleness job body — flags prices not updated within the current Jalali day. */
export async function recomputeStaleness(): Promise<number> {
  const db = getDb();
  const now = new Date();
  const fresh = await db
    .select({ skuId: currentPrices.skuId, updatedAt: currentPrices.confirmedAt })
    .from(currentPrices)
    .where(eq(currentPrices.isStale, false));
  const toFlag = fresh.filter((r) => !isSameJalaliDay(r.updatedAt, now)).map((r) => r.skuId);
  if (toFlag.length === 0) return 0;
  await db.update(currentPrices).set({ isStale: true }).where(inArray(currentPrices.skuId, toFlag));
  return toFlag.length;
}

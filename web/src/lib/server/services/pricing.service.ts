/**
 * Pricing writes — THE single write path for prices (admin grid, bulk save,
 * AI/admin tools). One transaction: lock row → compute movement → upsert
 * current_prices → append price_points → audit. (acceptance-criteria §B2)
 */
import { eq, inArray } from 'drizzle-orm';
import { ulid } from 'ulid';
import { getDb } from '@/lib/server/db/client';
import { currentPrices, pricePoints, skus, auditEntries } from '@/lib/server/db/schema';
import type { PriceUnit } from '@/lib/types/domain';
import { isSameJalaliDay } from '@/lib/server/utils/jalali';

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

/** Save one price (in an existing transaction when part of a bulk save). */
export async function savePrice(actorId: string, input: SavePriceInput): Promise<SavePriceResult> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const skuRows = await tx.select().from(skus).where(eq(skus.id, input.skuId)).limit(1);
    const sku = skuRows[0];
    if (!sku) throw new Error(`SKU not found: ${input.skuId}`);

    const prevRows = await tx
      .select()
      .from(currentPrices)
      .where(eq(currentPrices.skuId, input.skuId))
      .for('update');
    const prev = prevRows[0] ?? null;

    const price = Math.round(input.price);
    let movementPct: number | null = null;
    let movementDir: 'up' | 'down' | 'flat' = 'flat';
    if (prev && prev.price > 0) {
      movementPct = Math.round(((price - prev.price) / prev.price) * 10000) / 100;
      movementDir = movementPct > 0.05 ? 'up' : movementPct < -0.05 ? 'down' : 'flat';
    }

    const unit = input.unit ?? prev?.unit ?? sku.unit;
    const now = new Date();
    await tx
      .insert(currentPrices)
      .values({
        skuId: input.skuId,
        price,
        unit,
        deliveryTime: input.deliveryTime ?? prev?.deliveryTime ?? '۲۴ ساعت',
        vatIncluded: input.vatIncluded ?? prev?.vatIncluded ?? false,
        movementPct,
        movementDir,
        updatedAt: now,
        updatedBy: actorId,
        isStale: false,
      })
      .onConflictDoUpdate({
        target: currentPrices.skuId,
        set: {
          price,
          unit,
          deliveryTime: input.deliveryTime ?? prev?.deliveryTime ?? '۲۴ ساعت',
          vatIncluded: input.vatIncluded ?? prev?.vatIncluded ?? false,
          movementPct,
          movementDir,
          updatedAt: now,
          updatedBy: actorId,
          isStale: false,
        },
      });

    // Append-only history — every save (spec: HISTORY_RETENTION unlimited).
    await tx.insert(pricePoints).values({ id: ulid(), skuId: input.skuId, price, unit, at: now });

    await tx.insert(auditEntries).values({
      id: ulid(),
      actorId,
      action: 'price.update',
      entityType: 'sku',
      entityId: input.skuId,
      before: prev ? { price: prev.price, unit: prev.unit, deliveryTime: prev.deliveryTime } : null,
      after: { price, unit, deliveryTime: input.deliveryTime ?? prev?.deliveryTime ?? '۲۴ ساعت' },
    });

    return { skuId: input.skuId, price, movementPct, movementDir };
  });
}

/** Bulk daily grid save — sequential per-row transactions, collects results. */
export async function savePrices(actorId: string, inputs: SavePriceInput[]): Promise<SavePriceResult[]> {
  const out: SavePriceResult[] = [];
  for (const input of inputs) {
    out.push(await savePrice(actorId, input));
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

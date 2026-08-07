import type { PriceRow } from '@/lib/types/domain';

/** One factory's line in a bulk split: its representative per-kg price + line cost. */
export type FactoryLine = {
  factory: string;
  pricePerKg: number;
  lineToman: number;
  rowCount: number;
  best: boolean;
};

export type BulkSplit = {
  tonnage: number;
  totalKg: number;
  lines: FactoryLine[];
  cheapest: FactoryLine | null;
};

/**
 * Pure factory-comparison calculator — shared by the «مقایسهٔ کارخانه‌ها» panel,
 * the AI advisor and the landing teaser (server-safe: no client deps). Groups
 * rows by factory, takes each factory's *average* current per-kg price as its
 * representative quote, and prices the requested tonnage against it. Sorted
 * cheapest-first; the cheapest is flagged `best`. Guards empty input.
 */
export function computeBulkSplit(rows: PriceRow[], tonnage: number): BulkSplit {
  const tons = Number.isFinite(tonnage) && tonnage > 0 ? tonnage : 0;
  const totalKg = tons * 1000;

  // W23 audit fix: a stale-hidden row's `current.price` is a `0` sentinel
  // (catalogRepo.toPriceRow) — averaging it in with real prices dragged a
  // factory's representative quote toward zero, making it look artificially
  // (and wrongly) cheapest. A withheld price contributes no real signal to
  // "which factory is cheapest," so it's excluded rather than counted as 0.
  const byFactory = new Map<string, { sum: number; count: number }>();
  for (const r of rows.filter((r) => !r.current.priceHidden)) {
    // Not every SKU is priced per kg (see PriceUnit: 'kg' | 'branch' | 'sheet'
    // | 'meter') — averaging a per-sheet/per-branch/per-meter price in raw
    // alongside real per-kg prices, then labelling the result "pricePerKg",
    // silently produced a wrong number (and a wrong "cheapest factory") the
    // instant a non-kg SKU got a real price. Normalize with the same
    // theoreticalWeightKg conversion estimate.service.ts already uses for
    // the identical branch/sheet/meter → kg problem. A non-kg row with no
    // weight on file can't be converted safely, so it's excluded rather than
    // risk averaging in an unconverted price.
    const unit = r.current.unit;
    const pricePerKg =
      unit === 'kg'
        ? r.current.price
        : r.theoreticalWeightKg && r.theoreticalWeightKg > 0
          ? r.current.price / r.theoreticalWeightKg
          : null;
    if (pricePerKg === null) continue;
    const f = r.factory ?? 'سایر';
    const acc = byFactory.get(f) ?? { sum: 0, count: 0 };
    acc.sum += pricePerKg;
    acc.count += 1;
    byFactory.set(f, acc);
  }

  const draft = [...byFactory.entries()].map(([factory, acc]) => {
    const pricePerKg = Math.round(acc.sum / acc.count);
    return {
      factory,
      pricePerKg,
      lineToman: Math.round(pricePerKg * totalKg),
      rowCount: acc.count,
    };
  });
  draft.sort((a, b) => a.pricePerKg - b.pricePerKg);

  const minPrice = draft.length > 0 ? draft[0]!.pricePerKg : 0;
  const lines: FactoryLine[] = draft.map((d) => ({ ...d, best: d.pricePerKg === minPrice }));

  return {
    tonnage: tons,
    totalKg,
    lines,
    cheapest: lines[0] ?? null,
  };
}

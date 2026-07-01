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

  const byFactory = new Map<string, { sum: number; count: number }>();
  for (const r of rows) {
    const f = r.factory ?? 'سایر';
    const acc = byFactory.get(f) ?? { sum: 0, count: 0 };
    acc.sum += r.current.price;
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

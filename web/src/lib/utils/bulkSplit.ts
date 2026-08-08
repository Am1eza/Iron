import type { PriceRow } from '@/lib/types/domain';

export type ProductGroup = { subCategoryId?: string };

/**
 * Picks the single most-comparable sub-category among `rows` — the one with
 * the most distinct factories quoting it (ties broken by row count).
 * "Which factory is cheapest" only means something within ONE real product
 * line: blending a factory's price across entirely different sub-categories
 * (e.g. all of «ورق سرد» — روغنی + رنگی + گالوانیزه — at once, or میلگرد
 * «ساده» blended with «آجدار A3») averages non-equivalent products into a
 * misleading number. Callers that don't have an explicit sub-category from
 * the user narrow to this group first. Deliberately does NOT also narrow by
 * exact size — real catalog data confirmed (aiToolsCompareFactories.test.ts)
 * that a single exact size is very often quoted by only one mill, which
 * would make "compare factories" collapse to one factory almost every time;
 * different sizes of the SAME grade are still a defensible comparison.
 * Returns null for empty input.
 */
export function pickBestGroup(rows: PriceRow[]): ProductGroup | null {
  const groups = new Map<string, { subCategoryId?: string; factories: Set<string>; rowCount: number }>();
  for (const r of rows) {
    if (r.current.priceHidden) continue;
    const key = r.subCategoryId ?? '';
    const g = groups.get(key) ?? { subCategoryId: r.subCategoryId, factories: new Set<string>(), rowCount: 0 };
    if (r.factory) g.factories.add(r.factory);
    g.rowCount += 1;
    groups.set(key, g);
  }
  let best: { subCategoryId?: string; factories: Set<string>; rowCount: number } | undefined;
  for (const g of groups.values()) {
    if (!best || g.factories.size > best.factories.size || (g.factories.size === best.factories.size && g.rowCount > best.rowCount)) {
      best = g;
    }
  }
  return best ? { subCategoryId: best.subCategoryId } : null;
}

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
    // `current.price` is ALREADY per kilogram for every SKU regardless of
    // `unit` — `unit` only says what a customer's `qty` counts in (kg mass
    // vs. whole branches/sheets/meters), not what the price is denominated
    // in (see PriceTable's «تومان / کیلوگرم» label, CostCalculator, and
    // leads.service.ts's priceItems, all of which treat it the same way).
    // This function used to divide a non-kg row's price by
    // theoreticalWeightKg to "convert" it — that's the wrong direction
    // entirely and, on a real branch-priced SKU, would have silently
    // produced a per-kg quote off by that same weight factor. No conversion
    // is needed: the price is already per kg.
    const pricePerKg = r.current.price;
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

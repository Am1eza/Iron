/**
 * Tender/bid estimate (US-tender) — the server-authoritative core.
 *
 * A tender is 2–100 line items a کارشناس would otherwise price by hand: look
 * up each product's day price, multiply by its weight, sum. This module does
 * exactly that, but never trusts the client for a number that ends up on a
 * quote:
 *
 *  - `factoryOptionsFor()` turns one (product line, size) into the concrete
 *    factory choices, each an actual SKU with its live price, cheapest first —
 *    the row's default is the cheapest, and "let the user change the factory"
 *    is simply picking a different `skuId`, because every downstream number
 *    (`priceItems`, `createLead`, the پیش‌فاکتور) already keys on `skuId`.
 *  - `priceTender()` reuses `priceItems` — the SAME authoritative pricing the
 *    real پیش‌فاکتور path uses (unit forced to the SKU's, stale/hidden prices
 *    withheld, deactivated SKUs dropped) — and adds the VAT/total math so the
 *    live estimate a customer sees matches, to the ریال, the proforma they get
 *    when they submit.
 *
 * Comparing factory prices by raw `unitPrice` is correct here precisely
 * because a (sub-category, size) group is ONE physical product from different
 * factories — same unit, same weight — so there is nothing to normalize, the
 * cross-product per-kg averaging that `computeBulkSplit` needs does not apply.
 */
import { inArray } from 'drizzle-orm';
import { getDb } from '@/lib/server/db/client';
import { skus } from '@/lib/server/db/schema';
import { tableRows } from '@/lib/server/repos/catalogRepo';
import { getVatRate } from '@/lib/server/repos/settingsRepo';
import { priceItems } from '@/lib/server/services/leads.service';
import type { PriceUnit } from '@/lib/types/domain';

/** «نامشخص» — a SKU with no `factory` set still has to be a selectable option. */
export const UNKNOWN_FACTORY = 'نامشخص';

export interface FactoryOption {
  skuId: string;
  factory: string;
  size?: string;
  unit: PriceUnit;
  /** Per-unit theoretical weight; `null` when the SKU carries none and the
   *  unit is not kg (weight — and therefore a kg-based total — is unknown). */
  weightKgPerUnit: number | null;
  /** `null` when the SKU has no live, non-stale price — the UI shows «استعلام»
   *  and the row cannot be auto-quoted (never invent a price). */
  unitPrice: number | null;
  /** The cheapest priced option in the group — the row's default selection. */
  cheapest: boolean;
}

/**
 * The factory options for a (category, sub-category, size). Cheapest priced
 * option first; unpriced options sink to the bottom. `size` omitted → every
 * size in the sub-category (used only when a sub-category has a single size).
 */
export async function factoryOptionsFor(
  categorySlug: string,
  subSlug: string,
  size?: string,
): Promise<FactoryOption[]> {
  const rows = await tableRows(categorySlug, subSlug);
  const matched = size ? rows.filter((r) => (r.size ?? '') === size) : rows;

  const opts = matched.map((r) => {
    // toPriceRow zeroes a withheld/absent price and flags `priceHidden`; both
    // mean "no quotable price" here.
    const priced = !r.current.priceHidden && r.current.price > 0;
    return {
      skuId: r.id,
      factory: r.factory ?? UNKNOWN_FACTORY,
      size: r.size,
      unit: r.unit,
      weightKgPerUnit: r.unit === 'kg' ? 1 : (r.theoreticalWeightKg ?? null),
      unitPrice: priced ? r.current.price : null,
      cheapest: false,
    };
  });

  const priced = opts.filter((o) => o.unitPrice != null);
  const min = priced.length ? Math.min(...priced.map((o) => o.unitPrice as number)) : null;

  return opts
    .map((o) => ({ ...o, cheapest: min != null && o.unitPrice === min }))
    .sort((a, b) => {
      if (a.unitPrice == null && b.unitPrice == null) return 0;
      if (a.unitPrice == null) return 1;
      if (b.unitPrice == null) return -1;
      return a.unitPrice - b.unitPrice;
    });
}

/** The distinct sizes offered under a sub-category, in catalog order. */
export async function sizesFor(categorySlug: string, subSlug: string): Promise<string[]> {
  const rows = await tableRows(categorySlug, subSlug);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    const s = r.size ?? '';
    if (s && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

export interface TenderLine {
  skuId: string;
  name: string;
  factory?: string;
  qty: number;
  unit: PriceUnit;
  weightKg?: number;
  unitPrice?: number;
  lineTotal?: number;
  priced: boolean;
}

export interface TenderQuote {
  lines: TenderLine[];
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  grandTotal: number;
  /** Every line resolved to a live price — the gate the پیش‌فاکتور path uses
   *  to decide it can auto-issue a binding quote rather than route to a human. */
  allPriced: boolean;
}

/**
 * Price a whole tender for the LIVE estimate. Delegates every per-line number
 * to `priceItems` (the authoritative path) so the running total shown as the
 * user edits equals the proforma total on submit — then layers on VAT and the
 * grand total, rounded the same way `createLead` rounds them.
 */
export async function priceTender(items: { skuId: string; qty: number }[]): Promise<TenderQuote> {
  // Resolve each SKU's REAL unit first and pass it through. priceItems treats a
  // client unit that disagrees with the SKU's as a stale/forged basis and
  // refuses to price the line (allPriced=false) — so a hardcoded placeholder
  // unit would wrongly mark every non-kg product (شاخه/برگ/متر) as «استعلام».
  // The tender rows only ever carry real SKU ids (from factoryOptionsFor), so
  // a direct id→unit map is enough; an id that doesn't resolve falls back to a
  // value priceItems will fail to price anyway.
  const ids = [...new Set(items.map((i) => i.skuId))];
  const unitRows = ids.length
    ? await getDb().select({ id: skus.id, unit: skus.unit }).from(skus).where(inArray(skus.id, ids))
    : [];
  const unitById = new Map(unitRows.map((r) => [r.id, r.unit] as const));

  const { lines, allPriced } = await priceItems(
    items.map((i) => ({ skuId: i.skuId, qty: i.qty, unit: unitById.get(i.skuId) ?? 'kg' })),
  );

  const outLines: TenderLine[] = lines.map((l) => ({
    skuId: l.skuId,
    name: l.name,
    qty: l.qty,
    unit: l.unit,
    weightKg: l.weightKg,
    unitPrice: l.unitPrice,
    lineTotal: l.lineTotal,
    priced: l.unitPrice != null,
  }));

  const subtotal = outLines.reduce((sum, l) => sum + (l.lineTotal ?? 0), 0);
  const vatRate = await getVatRate();
  const vatAmount = Math.round(subtotal * vatRate);
  return { lines: outLines, subtotal, vatRate, vatAmount, grandTotal: subtotal + vatAmount, allPriced };
}

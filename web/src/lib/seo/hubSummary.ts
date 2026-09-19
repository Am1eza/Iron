import type { PriceBasis, PriceRow } from '@/lib/types/domain';
import { sizeFacetSlug } from '@/lib/utils/catalogFacets';

/**
 * What a price HUB (a category page) can say about itself beyond the table:
 * the price range per sub-category and per size, computed from exactly the
 * rows the page renders. The competitors that hold page one for «قیمت پروفیل
 * امروز» all carry several such summary tables (1,400–9,700 words against our
 * 537); these are the same answer, but every number is one a visitor can find
 * in the table on the same page.
 *
 * A range only ever spans rows quoted per the SAME basis — a per-kg and a
 * per-bar price have no common range (same rule as `priceFacts`).
 */
export interface RangeSummary {
  basis: PriceBasis;
  /** Priced rows the range covers. */
  count: number;
  min: number;
  max: number;
  /** Distinct published mills among them. */
  mills: number;
}

export interface SubSummary extends RangeSummary {
  slug: string;
}

export interface SizeSummary extends RangeSummary {
  slug: string;
  label: string;
}

function isConfirmed(r: PriceRow): boolean {
  const c = r.current;
  return !c.priceHidden && !c.priceIsEstimated && c.price > 0;
}

function basisOf(r: PriceRow): PriceBasis {
  return r.current.priceBasis ?? r.priceBasis;
}

function summarize(rows: readonly PriceRow[]): RangeSummary | null {
  const priced = rows.filter(isConfirmed);
  if (priced.length === 0) return null;
  const byBasis = new Map<PriceBasis, PriceRow[]>();
  for (const r of priced) byBasis.set(basisOf(r), [...(byBasis.get(basisOf(r)) ?? []), r]);
  const [basis, group] = [...byBasis.entries()].sort(
    (a, b) => b[1].length - a[1].length || Number(b[0] === 'kg') - Number(a[0] === 'kg'),
  )[0]!;
  const prices = group.map((r) => r.current.price);
  const mills = new Set(group.map((r) => r.factory?.trim()).filter((f): f is string => Boolean(f)));
  return { basis, count: group.length, min: Math.min(...prices), max: Math.max(...prices), mills: mills.size };
}

/** One entry per sub-category that has at least one confirmed price, in the
 *  order of `subs` (the admin's order). */
export function subSummaries(
  rows: readonly PriceRow[],
  subs: readonly { slug: string }[],
): SubSummary[] {
  const out: SubSummary[] = [];
  for (const sub of subs) {
    const s = summarize(rows.filter((r) => r.subCategoryId === sub.slug));
    if (s) out.push({ slug: sub.slug, ...s });
  }
  return out;
}

/** The `limit` sizes with the most priced rows (ties: more mills, then the
 *  larger price spread first is irrelevant — label order keeps it stable). */
export function sizeSummaries(rows: readonly PriceRow[], limit = 12): SizeSummary[] {
  const bySlug = new Map<string, { labels: Map<string, number>; rows: PriceRow[] }>();
  const entryFor = (slug: string) => {
    let e = bySlug.get(slug);
    if (!e) {
      e = { labels: new Map<string, number>(), rows: [] };
      bySlug.set(slug, e);
    }
    return e;
  };
  for (const r of rows) {
    const label = r.size?.trim();
    if (!label) continue;
    const slug = sizeFacetSlug(label);
    if (!slug) continue;
    const entry = entryFor(slug);
    entry.labels.set(label, (entry.labels.get(label) ?? 0) + 1);
    entry.rows.push(r);
  }
  const out: SizeSummary[] = [];
  for (const [slug, { labels, rows: group }] of bySlug) {
    const s = summarize(group);
    if (!s) continue;
    const label = [...labels.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fa'))[0]![0];
    out.push({ slug, label, ...s });
  }
  return out
    .sort((a, b) => b.count - a.count || b.mills - a.mills || a.slug.localeCompare(b.slug))
    .slice(0, limit);
}

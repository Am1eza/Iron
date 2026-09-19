import type { PriceBasis, PriceRow } from '@/lib/types/domain';

/**
 * The few facts about a price table that an answer engine is asked for —
 * "how much is X today", "which mills", "when was this updated" — computed
 * from exactly the rows the page renders. This backs both the visible FAQ
 * and its FAQPage JSON-LD (see `PriceFaq`), and the «آخرین به‌روزرسانی»
 * line under the page heading.
 *
 * Nothing here is estimated, rounded into a nicer range or filled in: an
 * answer engine quotes these sentences out of context, so every number has
 * to be one a visitor can find in the table on the same page.
 */
export interface PriceFacts {
  /** Rows publishing a confirmed price (not hidden, not estimated, > 0). */
  pricedCount: number;
  /** The basis most priced rows are quoted per. The range covers only
   *  these rows: a per-kg price and a per-bar price have no common range. */
  rangeBasis: PriceBasis;
  rangeCount: number;
  min: number;
  max: number;
  /** Newest confirmation among the priced rows, ISO, or null if none has a
   *  real one. */
  latestAt: string | null;
  /** Distinct published mill names, most-listed first. The row DTO already
   *  withholds `factory` where it is a country or import status (see
   *  `factoryIsMeaningful`), so a blank here is a deliberate absence. */
  factories: string[];
  /** One real kg-priced row that has a theoretical bar weight — the worked
   *  example behind «how is the price of one bar calculated». Null when no
   *  priced kg row carries a weight. */
  example: { size: string; weightKg: number; pricePerKg: number } | null;
}

/** Anything before this is the epoch sentinel `priceSync` writes for an
 *  unconfirmed row, not a date (same floor the sitemap uses). */
const EARLIEST_REAL_UPDATE = Date.UTC(2020, 0, 1);

function isConfirmedPrice(row: PriceRow): boolean {
  const c = row.current;
  return !c.priceHidden && !c.priceIsEstimated && c.price > 0;
}

function confirmedTime(row: PriceRow): number | null {
  const raw = row.current.confirmedAt ?? row.current.updatedAt;
  const t = raw ? Date.parse(raw) : NaN;
  return Number.isFinite(t) && t >= EARLIEST_REAL_UPDATE ? t : null;
}

export function priceFacts(rows: readonly PriceRow[]): PriceFacts | null {
  const priced = rows.filter(isConfirmedPrice);
  if (priced.length === 0) return null;

  const byBasis = new Map<PriceBasis, PriceRow[]>();
  for (const r of priced) {
    const basis = r.current.priceBasis ?? r.priceBasis;
    byBasis.set(basis, [...(byBasis.get(basis) ?? []), r]);
  }
  // Most rows first; ties go to kg, the catalog's own default basis, so the
  // choice is deterministic.
  const [rangeBasis, rangeRows] = [...byBasis.entries()].sort(
    (a, b) => b[1].length - a[1].length || Number(b[0] === 'kg') - Number(a[0] === 'kg'),
  )[0]!;
  const prices = rangeRows.map((r) => r.current.price);

  const times = priced.map(confirmedTime).filter((t): t is number => t !== null);

  const mills = new Map<string, number>();
  for (const r of priced) {
    const name = r.factory?.trim();
    if (name) mills.set(name, (mills.get(name) ?? 0) + 1);
  }

  const exampleRow = rangeBasis === 'kg'
    ? rangeRows.find((r) => r.size && r.theoreticalWeightKg && r.theoreticalWeightKg > 0)
    : undefined;

  return {
    pricedCount: priced.length,
    rangeBasis,
    rangeCount: rangeRows.length,
    min: Math.min(...prices),
    max: Math.max(...prices),
    latestAt: times.length > 0 ? new Date(Math.max(...times)).toISOString() : null,
    factories: [...mills.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fa'))
      .map(([name]) => name),
    example: exampleRow
      ? { size: exampleRow.size!, weightKg: exampleRow.theoreticalWeightKg!, pricePerKg: exampleRow.current.price }
      : null,
  };
}

const DATE_LOCALE: Record<string, string> = {
  fa: 'fa-IR-u-ca-persian',
  en: 'en-US',
  ar: 'ar',
  zh: 'zh-CN',
};

/** «۲۷ شهریور ۱۴۰۵» — the day only, for titles and snippets. Tehran calendar
 *  day, so it never flips because the server runs on UTC. */
export function formatPriceDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(DATE_LOCALE[locale] ?? DATE_LOCALE.fa, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Tehran',
  }).format(new Date(iso));
}

/** «۲۷ شهریور ۱۴۰۵ ساعت ۱۰:۰۰» — Tehran wall-clock, which is what the
 *  mills and the market quote in, regardless of the server's UTC clock. */
export function formatPriceUpdatedAt(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(DATE_LOCALE[locale] ?? DATE_LOCALE.fa, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tehran',
  }).format(new Date(iso));
}

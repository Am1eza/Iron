/**
 * Catalog rows → typed advisor blocks (see lib/ai/blocks.ts).
 *
 * PURE ON PURPOSE. Nothing here touches the database, Redis or `process.env`:
 * the caller (aiTools) does the repo reads and hands the rows in. That keeps
 * the part with the actual judgement in it — which dimension is ambiguous,
 * which mill is cheapest once freight is added, what counts as a real price —
 * unit-testable without a Postgres, which is the difference between this
 * logic having tests and not having them.
 *
 * It is also the ONLY place a number gets into a block, which is what lets
 * the grounding validator stay a prose-only gate: every figure below is read
 * off a `PriceRow`/`PricePoint` the price tables render from, never off
 * anything the model wrote.
 */
import type { AdvisorBlock, BlockOption, BlockOptionGroup, CompareBlock, CompareRow, OptionsBlock, QuoteBlock, TrendBlock, TrendSeries } from '@/lib/ai/blocks';
import type { PriceRow, PricePoint } from '@/lib/types/domain';
import { priceBasisNoun } from '@/lib/utils/catalogLabels';
import { computeBulkSplit } from '@/lib/utils/bulkSplit';
import { estimateLogistics, type LogisticsConfig } from '@/lib/data/logistics';
import { routes } from '@/lib/routes';

/**
 * A row's own product page. `PriceRow.categoryId`/`subCategoryId` carry the
 * category and sub-category SLUGS (see catalogRepo's `toPriceRow`, which
 * populates them from `catSlug`/`subSlug`), which is exactly what
 * `routes.sku` wants — the URL is never assembled by hand here.
 */
export function skuHref(row: Pick<PriceRow, 'categoryId' | 'subCategoryId' | 'slug'>): string | undefined {
  if (!row.categoryId || !row.subCategoryId || !row.slug) return undefined;
  return routes.sku(row.categoryId, row.subCategoryId, row.slug);
}

/** «تومان / کیلوگرم» — the row's own denomination, never assumed. */
export function unitLabelFor(row: Pick<PriceRow, 'priceBasis' | 'branchLengthM' | 'current'>): string {
  return `تومان / ${priceBasisNoun(row.current?.priceBasis ?? row.priceBasis, row.branchLengthM)}`;
}

/** A price that can actually be quoted: not withheld, not a `0` sentinel. */
function hasRealPrice(r: PriceRow): boolean {
  return !r.current.priceHidden && r.current.price > 0;
}

/* --------------------------------------------------------------- trend ---- */

/**
 * Price points → one point per calendar day, ascending.
 *
 * `price_points` gets a row per repricing, so a "30 day" window can be six
 * edits made on one afternoon. The sparkline's x-axis is time, and drawing
 * six same-day edits as six days is simply a wrong chart — collapse to the
 * day's LAST value (a daily close), exactly as `marketRepo.marketHistory`
 * already does for the ticker series.
 */
export function toDailySeries(points: ReadonlyArray<PricePoint>): TrendSeries {
  const byDay = new Map<string, PricePoint>();
  for (const p of [...points].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))) {
    byDay.set(p.at.slice(0, 10), p); // later row of the same day wins
  }
  const rows = [...byDay.values()];
  return { values: rows.map((p) => p.price), dates: rows.map((p) => p.at) };
}

/** Net change across a series, percent. Undefined when it cannot be computed
 *  honestly (fewer than two points, or a zero/absent baseline). */
export function seriesChangePct(values: ReadonlyArray<number>): number | undefined {
  if (values.length < 2) return undefined;
  const first = values[0]!;
  const last = values[values.length - 1]!;
  if (!Number.isFinite(first) || !Number.isFinite(last) || first <= 0) return undefined;
  return Math.round(((last - first) / first) * 1000) / 10;
}

/**
 * A sparkline is only worth drawing when there is something to see. One point
 * is a dot, and two points a week apart drawn as a line implies a trend the
 * data does not contain — below this the card simply omits its chart.
 */
export const MIN_TREND_POINTS = 4;

export function buildTrendSeries(points: ReadonlyArray<PricePoint>): TrendSeries | undefined {
  const series = toDailySeries(points);
  return series.values.length >= MIN_TREND_POINTS ? series : undefined;
}

export function buildTrendBlock(opts: {
  title: string;
  unitLabel: string;
  rangeLabel: string;
  points: ReadonlyArray<PricePoint>;
  href?: string;
}): TrendBlock | null {
  const series = buildTrendSeries(opts.points);
  if (!series) return null;
  return {
    kind: 'trend',
    title: opts.title,
    unitLabel: opts.unitLabel,
    rangeLabel: opts.rangeLabel,
    values: series.values,
    dates: series.dates,
    changePct: seriesChangePct(series.values),
    ...(opts.href ? { href: opts.href } : {}),
  };
}

/* --------------------------------------------------------------- quote ---- */

export function buildQuoteBlock(row: PriceRow, points?: ReadonlyArray<PricePoint>): QuoteBlock {
  const trend = points ? buildTrendSeries(points) : undefined;
  const href = skuHref(row);
  return {
    kind: 'quote',
    name: row.name,
    ...(href ? { href } : {}),
    ...(row.factory ? { factory: row.factory } : {}),
    ...(row.size ? { size: row.size } : {}),
    ...(row.grade ? { grade: row.grade } : {}),
    // A withheld price is a `0` sentinel on the row — it must reach the card
    // as `null` so the card shows «استعلام از کارشناس», never «۰ تومان».
    price: row.current.priceHidden ? null : row.current.price,
    unitLabel: unitLabelFor(row),
    ...(typeof row.current.movementPct === 'number' ? { movementPct: row.current.movementPct } : {}),
    movementDir: row.current.movementDir,
    ...(row.current.priceHidden ? {} : { deliveryTime: row.current.deliveryTime }),
    updatedAt: row.current.updatedAt,
    isStale: row.current.isStale,
    ...(trend ? { trend } : {}),
  };
}

/* ------------------------------------------------------------- compare ---- */

/** Freshest `updatedAt` among rows, as ISO. */
function newestUpdatedAt(rows: ReadonlyArray<PriceRow>): string {
  let best = 0;
  let iso = new Date(0).toISOString();
  for (const r of rows) {
    const t = Date.parse(r.current.updatedAt);
    if (Number.isFinite(t) && t > best) {
      best = t;
      iso = r.current.updatedAt;
    }
  }
  return iso;
}

export interface CompareOptions {
  title: string;
  subtitle?: string;
  tonnage?: number;
  /** Landed-cost column: both are required for it to appear at all. */
  city?: string;
  cityKm?: number;
  logistics?: LogisticsConfig;
  vatRate?: number;
  /** Cap on rendered rows — a mobile card stack, not a spreadsheet. */
  limit?: number;
}

/**
 * The signature card: every mill quoting this product, side by side.
 *
 * Two "cheapest" badges, not one, and that is the point. The mill with the
 * lowest per-kilogram price is frequently NOT the cheapest delivered — the
 * whole reason this business is worth calling is that someone has done the
 * freight arithmetic. When the visitor's city is known the card computes both
 * and badges them separately; when it is not, it shows only the goods price
 * and says nothing about delivery, rather than implying the ex-works winner
 * is the one to buy from.
 *
 * Per-factory movement is taken from that factory's most recently repriced
 * row (not an average of movements): the average price is a blend across the
 * mill's rows, but "what changed since yesterday" is a fact about a specific
 * quote, and averaging two rows repriced on different days produces a number
 * that describes neither.
 */
export function buildCompareBlock(rows: ReadonlyArray<PriceRow>, opts: CompareOptions): CompareBlock | null {
  const priced = rows.filter(hasRealPrice);
  if (priced.length === 0) return null;

  const tonnage = opts.tonnage && opts.tonnage > 0 ? opts.tonnage : undefined;
  // ONE calculator, shared with «مقایسهٔ کارخانه‌ها» on the price table and
  // with compareFactories — the advisor and the panel cannot disagree about
  // which mill is cheapest because they run the same function.
  const split = computeBulkSplit([...priced], tonnage ?? 1);
  if (split.lines.length === 0) return null;

  const byFactory = new Map<string, PriceRow[]>();
  for (const r of priced) {
    const key = r.factory ?? 'سایر';
    byFactory.set(key, [...(byFactory.get(key) ?? []), r]);
  }

  const canLand =
    typeof opts.cityKm === 'number' && opts.cityKm > 0 && Boolean(opts.city) && tonnage !== undefined;

  let cheapestLandedFactory: string | undefined;
  let cheapestLandedValue = Number.POSITIVE_INFINITY;

  const rowsOut: CompareRow[] = split.lines.map((line) => {
    const own = byFactory.get(line.factory) ?? [];
    // Most recently repriced row of this mill — see the doc comment above.
    const freshest = [...own].sort(
      (a, b) => Date.parse(b.current.updatedAt) - Date.parse(a.current.updatedAt),
    )[0];
    const totalToman = tonnage !== undefined ? line.lineToman : undefined;
    let landedToman: number | undefined;
    if (canLand && totalToman !== undefined) {
      const landed = estimateLogistics(
        tonnage!,
        opts.cityKm!,
        totalToman,
        opts.vatRate ?? 0,
        opts.logistics,
      );
      landedToman = landed.total;
      if (landedToman < cheapestLandedValue) {
        cheapestLandedValue = landedToman;
        cheapestLandedFactory = line.factory;
      }
    }
    return {
      factory: line.factory,
      pricePerKg: line.pricePerKg,
      ...(totalToman !== undefined ? { totalToman } : {}),
      ...(landedToman !== undefined ? { landedToman } : {}),
      ...(typeof freshest?.current.movementPct === 'number'
        ? { movementPct: freshest.current.movementPct }
        : {}),
      ...(freshest ? { movementDir: freshest.current.movementDir } : {}),
      rowCount: line.rowCount,
      updatedAt: freshest?.current.updatedAt ?? newestUpdatedAt(priced),
      // Only link when this mill has exactly one row here; with several, the
      // link would silently pick one of them and misrepresent the average.
      ...(own.length === 1 && skuHref(own[0]!) ? { href: skuHref(own[0]!)! } : {}),
      cheapest: line.best,
    };
  });

  if (cheapestLandedFactory) {
    for (const r of rowsOut) if (r.factory === cheapestLandedFactory) r.cheapestLanded = true;
  }

  // Cheapest vs. the next mill up — the veteran's talking point, computed
  // here so the model never has to subtract two figures itself (which the
  // grounding validator would rightly censor as an invented number).
  const savings =
    tonnage !== undefined && rowsOut.length > 1
      ? (rowsOut[1]!.totalToman ?? 0) - (rowsOut[0]!.totalToman ?? 0)
      : undefined;

  const limit = opts.limit ?? 8;
  return {
    kind: 'compare',
    title: opts.title,
    ...(opts.subtitle ? { subtitle: opts.subtitle } : {}),
    rows: rowsOut.slice(0, limit),
    ...(tonnage !== undefined ? { tonnage } : {}),
    ...(canLand ? { city: opts.city, originLabel: opts.logistics?.originLabel } : {}),
    ...(savings && savings > 0 ? { savingsVsNextToman: savings } : {}),
    ...(split.excludedNonKg > 0 ? { excludedNonKg: split.excludedNonKg } : {}),
    updatedAt: newestUpdatedAt(priced),
  };
}

/* ------------------------------------------------------------- options ---- */

/** At most this many chips per group. A visitor reads these at 375px; a
 *  catalog category with 30 sizes becomes a wall of buttons, not a question. */
export const MAX_OPTIONS_PER_GROUP = 8;

function toOptions(
  values: ReadonlyArray<{ label: string; count: number }>,
  send: (label: string) => string,
): { options: BlockOption[]; truncated: boolean } {
  const sorted = [...values].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'fa'));
  const shown = sorted.slice(0, MAX_OPTIONS_PER_GROUP);
  return {
    options: shown.map((v) => ({ label: v.label, send: send(v.label) })),
    truncated: sorted.length > shown.length,
  };
}

/** Distinct values of one row field, with how many priced rows carry each. */
function distinct(rows: ReadonlyArray<PriceRow>, pick: (r: PriceRow) => string | undefined) {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const v = pick(r)?.trim();
    if (!v) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()].map(([label, count]) => ({ label, count }));
}

export interface OptionsInput {
  /** What the visitor asked about, in their words — «میلگرد». */
  subject: string;
  rows: ReadonlyArray<PriceRow>;
  /** Sub-category SLUG → display name (`PriceRow.subCategoryId` is the slug —
   *  see `skuHref`), for the «نوع» group. */
  subNames?: ReadonlyMap<string, string>;
  /** Dimensions the visitor has ALREADY pinned down — never asked again. */
  known?: { sub?: boolean; size?: boolean; factory?: boolean };
}

/**
 * «کدام؟», as buttons over the options that actually exist.
 *
 * Asks about ONE dimension — the first genuinely ambiguous one, in the order
 * a steel buyer settles them (product type → size → mill). Offering all three
 * at once looks helpful and is not: three rows of chips do not say which
 * question a tap is answering, and the answer to "which size" changes what
 * the mill list should even contain.
 *
 * Returns null when nothing is ambiguous — there is then no question to ask,
 * and the caller should answer with a price instead.
 */
export function buildOptionsBlock(input: OptionsInput): OptionsBlock | null {
  const priced = input.rows.filter(hasRealPrice);
  const pool = priced.length > 0 ? priced : input.rows;
  if (pool.length === 0) return null;

  const groups: BlockOptionGroup[] = [];

  const subs = input.known?.sub
    ? []
    : distinct(pool, (r) => (r.subCategoryId ? input.subNames?.get(r.subCategoryId) : undefined));
  const sizes = input.known?.size ? [] : distinct(pool, (r) => r.size);
  const factories = input.known?.factory ? [] : distinct(pool, (r) => r.factory);

  if (subs.length > 1) {
    const { options, truncated } = toOptions(subs, (l) => `${input.subject} ${l}`);
    groups.push({ title: 'نوع', options, ...(truncated ? { truncated } : {}) });
  } else if (sizes.length > 1) {
    const { options, truncated } = toOptions(sizes, (l) => `قیمت ${input.subject} ${l}`);
    groups.push({ title: 'سایز', options, ...(truncated ? { truncated } : {}) });
  } else if (factories.length > 1) {
    const { options, truncated } = toOptions(factories, (l) => `قیمت ${input.subject} ${l}`);
    groups.push({ title: 'کارخانه', options, ...(truncated ? { truncated } : {}) });
  }

  if (groups.length === 0) return null;

  const group = groups[0]!;
  const question =
    group.title === 'سایز'
      ? `کدام سایز ${input.subject} را می‌خواهی؟`
      : group.title === 'کارخانه'
        ? `${input.subject} از کدام کارخانه؟`
        : `کدام نوع ${input.subject} مدنظرت است؟`;

  return { kind: 'options', subject: input.subject, question, groups };
}

/* -------------------------------------------------------------------------- */

/** Narrowing helper for callers that collect blocks of mixed kinds. */
export function isBlockOfKind<K extends AdvisorBlock['kind']>(
  block: AdvisorBlock,
  kind: K,
): block is Extract<AdvisorBlock, { kind: K }> {
  return block.kind === kind;
}

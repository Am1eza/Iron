/**
 * Grounded estimates — item totals from live prices, the project heuristic
 * (rebar tonnage from area×floors) and the landed-cost model driven by the
 * admin-configurable LOGISTICS settings. The AI tools call these too, so
 * every number a user sees has one source.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/lib/server/db/client';
import { skus, currentPrices } from '@/lib/server/db/schema';
import type { LineItem, PriceRow, PriceUnit } from '@/lib/types/domain';
import { getSetting, getVatRate } from '@/lib/server/repos/settingsRepo';
import { getPriceFreshness } from '@/lib/server/services/priceFreshness';
import { listSubCategories, tableRows } from '@/lib/server/repos/catalogRepo';
import { computeBulkSplit } from '@/lib/utils/bulkSplit';
import { normalizeDigits, toPersianDigits } from '@/lib/utils/format';
import { estimateLogistics, DEFAULT_LOGISTICS_CONFIG, type LogisticsConfig } from '@/lib/data/logistics';

export async function estimateItems(items: Array<{ skuId: string; qty: number; unit: PriceUnit }>) {
  const db = getDb();
  const ids = items.map((i) => i.skuId);
  const rows = await db
    .select({ sku: skus, price: currentPrices })
    .from(skus)
    .leftJoin(currentPrices, eq(currentPrices.skuId, skus.id))
    // W24: same `isActive` gate as leads.service.priceItems — an estimate
    // must never quote a delisted product, least of all via the AI tools
    // that call this.
    .where(and(inArray(skus.id, ids), eq(skus.isActive, true)));
  const byId = new Map(rows.map((r) => [r.sku.id, r] as const));
  for (const r of rows) byId.set(r.sku.slug, r);

  // Same hidden-stale gate as leads.service.priceItems and the AI's getPrice
  // tool — an estimate must never show a number the subsequent createLead
  // call would then quote differently (or refuse) for the same SKU.
  const freshness = await getPriceFreshness();

  const lines: LineItem[] = items.map((item) => {
    const hit = byId.get(item.skuId);
    const unitPrice = hit?.price && !freshness.isHidden(hit.price.updatedAt) ? hit.price.price : undefined;
    // Mirrors leads.service.priceItems, including its `piece` carve-out: a
    // کوپلر is quoted per عدد and has no branch weight to convert through.
    const weightKg =
      item.unit === 'piece'
        ? undefined
        : item.unit === 'kg'
          ? item.qty
          : hit?.sku.theoreticalWeightKg
            ? Math.round(hit.sku.theoreticalWeightKg * item.qty * 100) / 100
            : undefined;
    // `unitPrice` is per KILOGRAM, always — see leads.service.ts's
    // priceItems for the full reasoning (this function duplicates its
    // weightKg conversion and had the identical bug: charging by raw `qty`
    // instead of the already-converted `weightKg`). For `unit==='kg'`,
    // `weightKg === item.qty`, so this is a no-op for today's all-kg catalog.
    const lineTotal =
      unitPrice == null
        ? undefined
        : item.unit === 'piece'
          ? Math.round(unitPrice * item.qty)
          : weightKg != null
            ? Math.round(unitPrice * weightKg)
            : undefined;
    return {
      skuId: hit?.sku.id ?? item.skuId,
      name: hit?.sku.name ?? item.skuId,
      qty: item.qty,
      unit: item.unit,
      weightKg,
      unitPrice,
      lineTotal,
    };
  });

  const vatRate = await getVatRate();
  const subtotal = lines.reduce((s, l) => s + (l.lineTotal ?? 0), 0);
  const vatAmount = Math.round(subtotal * vatRate);
  return {
    lines,
    totalWeightKg: Math.round(lines.reduce((s, l) => s + (l.weightKg ?? 0), 0) * 100) / 100,
    subtotal,
    vatRate,
    vatAmount,
    total: subtotal + vatAmount,
  };
}

/* ------------------------------------------------------------------ */
/* The project heuristic                                              */
/* ------------------------------------------------------------------ */

/**
 * WHAT `areaM2` MEANS.
 *
 * «زیربنا» in the published Iranian construction sources — and in the way
 * every one of them applies its kg/m² figure — is the TOTAL built area of
 * all floors, not one floor's footprint. This function used to multiply the
 * given area BY the floor count, i.e. it silently read the number as
 * per-floor. On 2026-08-18 a visitor wrote «زیربنای ۵۰۰ متر که ۶ طبقه‌ای
 * هست» and was told, with no hedge, that they needed **۹۶ تن** — 500 × 6 ×
 * 32 kg. That is 192 kg/m² of stated زیربنا, roughly triple the heaviest
 * figure any source gives for any building.
 *
 * So `basis: 'total'` is the default and matches how customers speak. A
 * caller that genuinely means one floor's area passes `'perFloor'`, and
 * either way the result states which reading it used so the customer can
 * correct it in one sentence.
 */
export type AreaBasis = 'total' | 'perFloor';

/**
 * Rebar per m² of TOTAL built area, by storey count — and why it is a BAND.
 *
 * The published Iranian trade figures do not agree, and pretending they do
 * would be the same false precision this whole change exists to remove. Two
 * families, both current, both widely republished:
 *
 *   A. markazeahan.com/rebar-required-building-floors — the only page that
 *      splits by storey count: ۱ طبقه ۳۵-۴۵، ۲ طبقه ۴۵-۶۵، ۳ طبقه ۵۵-۷۰
 *      kg/m² of زیربنا. (esfahanahan.com's «۵۰ تا ۷۰» and ahangar.com's «۴۰
 *      تا ۵۵ برای اسکلت بتنی معمولی» sit in the same band but do not split
 *      by storey.)
 *   B. markazeahan.com/cost-consumed-iron-building and fooladiranian.com —
 *      a noticeably lighter ladder that DOES reach the storey counts family
 *      A stops short of: ۱ طبقه ۲۵-۳۵، ۲ طبقه ۳۰-۴۰، ۴ طبقه ۳۵-۵۰، ۵ طبقه
 *      ۴۰-۵۵, with a worked example of ۴۰۰ متر زیربنا در ۴ طبقه → ۱۶ تن
 *      (i.e. 40 kg/m²).
 *
 * They disagree by nearly 2x on the same building, which is a real thing
 * about this estimate and not a detail to average away silently. So:
 *
 *   - where BOTH families publish (1-3 storeys, family B's 3rd interpolated
 *     between its 2nd and 4th) the rate is the mean of their midpoints:
 *     35, 45, 50;
 *   - from there to family B's own published 4th and 5th storeys the ramp
 *     continues at EXTRA_KG_PER_FLOOR: 53, 56;
 *   - and the answer is REQUIRED to quote the band around the point rate
 *     (±BAND_PCT) rather than one confident tonnage. That band contains
 *     fooladiranian's own worked example (16t for 400m² over 4 floors).
 *
 * Above five storeys neither family publishes anything. The same ramp
 * continues (taller buildings drive more steel into their lower columns and
 * foundations, so the rate rises rather than flattens) and the result is
 * flagged `isExtrapolated` so the answer has to say so out loud and send the
 * customer to a structural engineer.
 */
const KG_PER_M2_BY_FLOORS: Record<number, number> = { 1: 35, 2: 45, 3: 50, 4: 53, 5: 56 };
const HIGHEST_PUBLISHED_FLOORS = 5;
const EXTRA_KG_PER_FLOOR = 3;
/** Beyond this the heuristic is meaningless; a tower is an engineered design. */
const MAX_KG_PER_M2 = 70;
/** How far either side of the point rate the published figures actually run. */
const BAND_PCT = 0.25;

export function rebarKgPerM2(floors: number): number {
  const whole = Math.max(1, Math.round(floors));
  const known = KG_PER_M2_BY_FLOORS[whole];
  if (known) return known;
  return Math.min(
    MAX_KG_PER_M2,
    KG_PER_M2_BY_FLOORS[HIGHEST_PUBLISHED_FLOORS]! + (whole - HIGHEST_PUBLISHED_FLOORS) * EXTRA_KG_PER_FLOOR,
  );
}

/** Above this many storeys the extrapolation is doing the work. */
const EXTRAPOLATED_ABOVE_FLOORS = HIGHEST_PUBLISHED_FLOORS;
/** A "floor" smaller than this is a sign the area was read the wrong way. */
const IMPLAUSIBLE_FLOOR_AREA_M2 = 30;

/**
 * How the tonnage splits across the structure, and which bar each part is
 * built from.
 *
 * The SHARES are the midpoints of markazeahan's own component table for a
 * two-storey frame (فونداسیون ۲۰-۲۵٪، ستون ۲۵-۳۰٪، تیر ۲۰-۲۵٪، سقف ۲۵-۳۰٪),
 * rounded to sum to 100. The DIAMETERS are the midpoint of the range that
 * same table gives each component (فونداسیون/ستون ۱۶-۲۰، تیر ۱۴-۱۸، سقف
 * ۱۲-۱۶), snapped to a size this catalog actually stocks.
 *
 * There is NO authoritative source for an exact percentage-per-diameter
 * split, and this does not pretend otherwise: it is one defensible, ordinary
 * mix, and the answer that carries it must say so. What it buys is the thing
 * a single tonnage figure cannot — a list of real products a customer can
 * actually order.
 */
export const REBAR_MIX: ReadonlyArray<{ component: string; sharePct: number; sizeMm: number }> = [
  { component: 'فونداسیون', sharePct: 22, sizeMm: 20 },
  { component: 'ستون‌ها', sharePct: 28, sizeMm: 18 },
  { component: 'تیرها', sharePct: 22, sizeMm: 16 },
  { component: 'سقف', sharePct: 28, sizeMm: 12 },
];

export interface ProjectRebarLine {
  /** Which part of the structure this bar is for. */
  component: string;
  sizeMm: number;
  sharePct: number;
  kg: number;
  tons: number;
  /** Present when this diameter exists in the catalog: the product NAME to
   *  put straight into prepareProforma (the mill is included once a price
   *  says which mill is cheapest). */
  product?: string;
  subCategory?: string;
  factoryCount: number;
  cheapestFactory?: string;
  pricePerKg?: number;
  lineToman?: number;
}

/**
 * The structural rebar rows: deformed bar (آجدار), which is what a concrete
 * frame is built from — plain (ساده A1), coil, stirrup and alloy lines are a
 * different product at a different price, and blending them would produce
 * the same misleading "cheapest" that pickBestGroup exists to prevent.
 *
 * Deliberately NOT pickBestGroup: that one skips every price-hidden row, so
 * with an un-repriced catalog (which is exactly the state of rebar today) it
 * returns null and there is no group at all. This picks on catalog SHAPE —
 * how many mills quote the line — so it still answers when no price does.
 */
function structuralRebarRows(rows: PriceRow[]): PriceRow[] {
  const deformed = rows.filter((r) => r.name.includes('آجدار'));
  const pool = deformed.length > 0 ? deformed : rows;
  const groups = new Map<string, { rows: PriceRow[]; factories: Set<string>; a3: number }>();
  for (const r of pool) {
    const key = r.subCategoryId ?? '';
    const g = groups.get(key) ?? { rows: [], factories: new Set<string>(), a3: 0 };
    g.rows.push(r);
    if (r.factory) g.factories.add(r.factory);
    if (r.grade === 'A3') g.a3 += 1;
    groups.set(key, g);
  }
  let best: { rows: PriceRow[]; factories: Set<string>; a3: number } | undefined;
  for (const g of groups.values()) {
    const better =
      !best ||
      g.factories.size > best.factories.size ||
      (g.factories.size === best.factories.size && g.rows.length > best.rows.length) ||
      // A3 is the standard structural grade; it breaks a tie on merit rather
      // than on whatever order the query happened to return.
      (g.factories.size === best.factories.size && g.rows.length === best.rows.length && g.a3 > best.a3);
    if (better) best = g;
  }
  return best?.rows ?? [];
}

/**
 * The words to put in prepareProforma's `product` field so it resolves to
 * THIS row and not to a sibling mill's.
 *
 * Production SKU names already carry the mill («میلگرد آجدار ۱۸ ابهر»), but
 * they are admin-entered and do not have to — the seeded catalog's names are
 * «میلگرد آجدار A3 ۱۸», with the factory only in its own column. Naming the
 * cheapest mill and then handing over a string that cannot select it would
 * make the recommendation unbuyable, so the factory is appended when the
 * name does not already contain it.
 */
function productName(row: PriceRow): string {
  const factory = row.factory?.trim();
  return factory && !row.name.includes(factory) ? `${row.name} ${factory}` : row.name;
}

export interface ProjectEstimate {
  areaBasis: AreaBasis;
  inputAreaM2: number;
  floors: number;
  totalAreaM2: number;
  areaPerFloorM2: number;
  kgPerM2: number;
  rebarKg: number;
  rebarTons: number;
  /** The published spread, not a decoration: the answer must quote the band,
   *  because the sources behind `kgPerM2` differ by nearly 2x. */
  rebarKgLow: number;
  rebarKgHigh: number;
  isExtrapolated: boolean;
  /** Set when the per-floor area implied by this reading is not believable —
   *  the model must ask which area the customer meant before answering. */
  areaWarning?: string;
  lines: ProjectRebarLine[];
  /** Only when EVERY line resolved to a live price. */
  costToman?: number;
  avgRebarPricePerKg?: number;
}

export async function estimateProject(
  areaM2: number,
  floors: number,
  basis: AreaBasis = 'total',
): Promise<ProjectEstimate> {
  const totalArea = basis === 'perFloor' ? areaM2 * floors : areaM2;
  const areaPerFloor = totalArea / Math.max(1, floors);
  const kgPerM2 = rebarKgPerM2(floors);
  const rebarKg = Math.round(totalArea * kgPerM2);

  const structural = structuralRebarRows(await tableRows('rebar'));
  const subSlug = structural[0]?.subCategoryId;
  const subName = subSlug
    ? (await listSubCategories('rebar')).find((s) => s.slug === subSlug)?.name
    : undefined;

  const lines: ProjectRebarLine[] = REBAR_MIX.map((spec) => {
    const kg = Math.round((rebarKg * spec.sharePct) / 100);
    const sizeRows = structural.filter((r) => r.size && normalizeDigits(r.size) === String(spec.sizeMm));
    const base: ProjectRebarLine = {
      component: spec.component,
      sizeMm: spec.sizeMm,
      sharePct: spec.sharePct,
      kg,
      tons: Math.round((kg / 1000) * 10) / 10,
      factoryCount: new Set(sizeRows.map((r) => r.factory).filter(Boolean)).size,
    };
    if (sizeRows.length === 0) return base;
    base.subCategory = subName;
    // Same cheapest-mill maths compareFactories runs — one implementation of
    // "which factory wins for this tonnage", not two.
    const priced = sizeRows.filter((r) => !r.current.priceHidden && r.current.price > 0);
    const split = priced.length > 0 ? computeBulkSplit(priced, kg / 1000) : null;
    const winner = split?.cheapest ?? null;
    const winnerRow = winner ? sizeRows.find((r) => r.factory === winner.factory) : undefined;
    // With no live price there is still a real product to order — just not a
    // mill to recommend. The generic name resolves to one row per mill,
    // which prepareProforma turns into «از کدام کارخانه؟» plus tappable chips.
    base.product = winnerRow
      ? productName(winnerRow)
      : subName
        ? `${subName} ${toPersianDigits(String(spec.sizeMm))}`
        : undefined;
    if (winner) {
      base.cheapestFactory = winner.factory;
      base.pricePerKg = winner.pricePerKg;
      base.lineToman = winner.lineToman;
    }
    return base;
  });

  const allPriced = lines.every((l) => typeof l.lineToman === 'number');
  const costToman = allPriced ? lines.reduce((s, l) => s + (l.lineToman ?? 0), 0) : undefined;
  const pricedRows = structural.filter((r) => !r.current.priceHidden && r.current.price > 0);
  const avg =
    pricedRows.length > 0
      ? Math.round(pricedRows.reduce((s, r) => s + r.current.price, 0) / pricedRows.length)
      : undefined;

  return {
    areaBasis: basis,
    inputAreaM2: areaM2,
    floors,
    totalAreaM2: Math.round(totalArea),
    areaPerFloorM2: Math.round(areaPerFloor),
    kgPerM2,
    rebarKg,
    rebarTons: Math.round((rebarKg / 1000) * 10) / 10,
    rebarKgLow: Math.round(rebarKg * (1 - BAND_PCT)),
    rebarKgHigh: Math.round(rebarKg * (1 + BAND_PCT)),
    isExtrapolated: floors > EXTRAPOLATED_ABOVE_FLOORS,
    ...(areaPerFloor < IMPLAUSIBLE_FLOOR_AREA_M2
      ? {
          areaWarning:
            'با این خوانش، مساحت هر طبقه غیرواقعی کوچک می‌شود. قبل از دادن هر عددی بپرس که این متراژ کل زیربنای همهٔ طبقه‌هاست یا مساحت هر طبقه.',
        }
      : {}),
    lines,
    costToman,
    avgRebarPricePerKg: avg,
  };
}

/** Shared with `BulkQuote`/`SkuDetail` (client, config passed as a prop from
 *  the server page) — see lib/data/logistics.ts for the freight model and
 *  why it used to be a second, separately-hardcoded copy of this exact
 *  formula that an admin's saved settings never actually reached. */
export async function landedCost(tons: number, city: string, goodsToman: number) {
  const [cfg, vatRate] = await Promise.all([
    getSetting<LogisticsConfig>('LOGISTICS', DEFAULT_LOGISTICS_CONFIG),
    getVatRate(),
  ]);
  const km = cfg.cities.find((c) => c.name === city.trim())?.km ?? 150;
  const estimate = estimateLogistics(tons, km, goodsToman, vatRate, cfg);
  return { ...estimate, km, origin: cfg.originLabel };
}

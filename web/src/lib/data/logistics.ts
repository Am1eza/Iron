/**
 * Landed-cost model — همهٔ سفارش‌ها از «انبار شادآباد تهران» ارسال می‌شوند.
 * Single source of truth for freight math, shared by `BulkQuote`/`SkuDetail`
 * (client-rendered, config passed down as a prop from the server page) and
 * `estimate.service.ts`'s `landedCost` (server, reads the same admin
 * `settings.LOGISTICS` row) — before this they were two separately hardcoded
 * copies of the same formula, so an admin editing the logistics settings
 * silently never affected the price-table's own «مقایسهٔ کارخانه‌ها» panel.
 *
 * Freight itself is a real, sourced, distance-bracket schedule rather than a
 * flat Toman/km rate: Iran's official road-freight tariff (سازمان راهداری،
 * دبیر کمیسیون حمل‌ونقل, سال ۱۴۰۵) TAPERS — the per-ton-km rate is much
 * higher for short hauls than long ones (a fixed dispatch cost amortized
 * over fewer km), a shape a single flat rate + minimum-trip floor cannot
 * represent without being badly wrong somewhere across a ~15–1300km spread
 * of real destination cities. `DEFAULT_FREIGHT_TABLE` below is the officially
 * reported net rate (خالص، پیش از کمیسیون/بیمه/باسکول/بارگیری) for 12- and
 * 18-wheel tractors/trailers: https://www.mashin3.com/fa/news-view/38930 —
 * 75km: 387,810 ت/تن، 500km: 1,344,050 ت/تن، 1000km: 2,069,800 ت/تن،
 * 2000km: 3,100,350 ت/تن. Below 75km there's no published bracket — treated
 * as a flat floor at the 75km rate (a short urban trip realistically costs
 * close to dispatching a full truck 75km, not less), rather than an
 * unfounded extrapolation.
 *
 * Handling (بارگیری/تخلیه), insurance and the weighbridge fee are reported
 * as separate line items on top of the base freight by the same source, but
 * I couldn't find an equally authoritative 1405 figure for them — those
 * three stay as the original mock-era estimates and are still
 * admin-editable; worth confirming against Amir's actual freight partners.
 *
 * Cross-check (1405/06/10): ahanprice.com's public «هزینه حمل بار از مبداً
 * بنگاه تهران» calculator (https://ahanprice.com/هزینه-ی-حمل-بار — a normal
 * page, not their robots.txt-disallowed `/Freight/GetFreight` API) quotes a
 * FULL TRUCKLOAD price from their Tehran/Shadabad depot — the same district
 * `ORIGIN_LABEL` ships from — e.g. Tehran ۶,۰۰۰,۰۰۰ت/۱۰-ton single truck,
 * Karaj ۵,۰۰۰,۰۰۰ت, Qom ۱۰,۰۰۰,۰۰۰ت, Isfahan ۱۱,۰۰۰,۰۰۰ت. That is a
 * DIFFERENT product (one all-in commercial truck charter, likely already
 * bundling driver/fuel/margin and possibly insurance) from this table's
 * NET-tariff-before-extras per-ton figure, so the two are not directly
 * substitutable — but per-ton they land within the same order of magnitude
 * (e.g. Qom: this table ≈540,000ت/ton net vs ahanprice's all-in
 * ≈1,000,000ت/ton for a 10-ton single truck), which is a sanity check in
 * favour of the current numbers, not a contradiction of them. It does NOT
 * expose handling/insurance/scale as separate figures, so it cannot source
 * those three — they still need Amir's actual freight partners.
 */
export const ORIGIN_LABEL = 'انبار شادآباد تهران';

export type FreightAnchor = { km: number; perTon: number };

/** Real 1405 net freight rate (Toman/ton) at each distance anchor — see file header. */
export const DEFAULT_FREIGHT_TABLE: FreightAnchor[] = [
  { km: 75, perTon: 387_810 },
  { km: 500, perTon: 1_344_050 },
  { km: 1000, perTon: 2_069_800 },
  { km: 2000, perTon: 3_100_350 },
];

export const HANDLING_PER_TON = 150_000; // بارگیری + تخلیه — unconfirmed for 1405, see file header
export const INSURANCE_RATE = 0.0025; // 0.25% of goods value — unconfirmed for 1405, see file header
export const SCALE_FEE = 75_000; // باسکول, flat — unconfirmed for 1405, see file header

/** Road distance (km) from the Shadabad warehouse. */
export const CITIES: { name: string; km: number }[] = [
  { name: 'تهران', km: 15 },
  { name: 'کرج', km: 45 },
  { name: 'قم', km: 140 },
  { name: 'ساری', km: 260 },
  { name: 'اراک', km: 280 },
  { name: 'همدان', km: 320 },
  { name: 'رشت', km: 325 },
  { name: 'اصفهان', km: 450 },
  { name: 'کرمانشاه', km: 500 },
  { name: 'تبریز', km: 620 },
  { name: 'یزد', km: 620 },
  { name: 'اهواز', km: 810 },
  { name: 'مشهد', km: 890 },
  { name: 'شیراز', km: 920 },
  { name: 'کرمان', km: 980 },
  { name: 'بندرعباس', km: 1280 },
];

export interface LogisticsConfig {
  originLabel: string;
  freightTable: FreightAnchor[];
  /** Legacy flat-rate fields from before the tapered table — a settings row
   *  saved before this upgrade has these but no `freightTable`; `estimateLogistics`
   *  falls back to the old `max(minTrip, tons*km*rate)` formula in that case
   *  so an old/unsaved config keeps behaving exactly as it did before. */
  freightRatePerTonKm?: number;
  freightMinTrip?: number;
  handlingPerTon: number;
  insuranceRate: number;
  scaleFee: number;
  cities: { name: string; km: number }[];
}

export const DEFAULT_LOGISTICS_CONFIG: LogisticsConfig = {
  originLabel: ORIGIN_LABEL,
  freightTable: DEFAULT_FREIGHT_TABLE,
  handlingPerTon: HANDLING_PER_TON,
  insuranceRate: INSURANCE_RATE,
  scaleFee: SCALE_FEE,
  cities: CITIES,
};

export function cityDistance(name: string | null | undefined, cities: { name: string; km: number }[] = CITIES): number | null {
  return cities.find((c) => c.name === name)?.km ?? null;
}

/** Delivery estimate by road distance (working days; ~1404 trucking norms). */
export function deliveryLabel(km: number): string {
  if (km < 150) return 'همان روز تا ۱ روز کاری';
  if (km < 400) return '۱ تا ۲ روز کاری';
  if (km < 700) return '۲ تا ۳ روز کاری';
  if (km < 1000) return '۳ تا ۴ روز کاری';
  return '۴ تا ۵ روز کاری';
}

/** Per-ton freight rate at `km`, piecewise-linearly interpolated between the
 *  real anchors (flat at the lowest anchor's rate below it; linearly
 *  extrapolates the last segment's slope beyond the highest anchor — none of
 *  ahantime's destination cities are past 2000km, so that only guards a
 *  future new city). */
export function freightPerTonFromTable(km: number, table: FreightAnchor[]): number {
  const sorted = [...table].sort((a, b) => a.km - b.km);
  if (sorted.length === 0) return 0;
  const first = sorted[0]!;
  if (km <= first.km) return first.perTon;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    if (km <= b.km) {
      const t = (km - a.km) / (b.km - a.km);
      return a.perTon + t * (b.perTon - a.perTon);
    }
  }
  const last = sorted[sorted.length - 1]!;
  const prev = sorted[sorted.length - 2] ?? first;
  const slope = last.km === prev.km ? 0 : (last.perTon - prev.perTon) / (last.km - prev.km);
  return last.perTon + (km - last.km) * slope;
}

export type LogisticsEstimate = {
  freight: number;
  handling: number;
  insurance: number;
  scale: number;
  vat: number;
  total: number; // goods + everything
  delivery: string;
};

/** Full landed-cost estimate for `tons` of goods worth `goodsToman`, shipped
 *  to a city `km` away, under logistics config `cfg` (from `settings.LOGISTICS`,
 *  or `DEFAULT_LOGISTICS_CONFIG` for dev/mock/never-configured callers). */
export function estimateLogistics(
  tons: number,
  km: number,
  goodsToman: number,
  vatRate: number,
  cfg: LogisticsConfig = DEFAULT_LOGISTICS_CONFIG,
): LogisticsEstimate {
  const freight =
    cfg.freightTable && cfg.freightTable.length > 0
      ? Math.round(tons * freightPerTonFromTable(km, cfg.freightTable))
      : Math.round(Math.max(cfg.freightMinTrip ?? 0, tons * km * (cfg.freightRatePerTonKm ?? 0)));
  const handling = Math.round(tons * cfg.handlingPerTon);
  const insurance = Math.round(goodsToman * cfg.insuranceRate);
  const vat = Math.round(goodsToman * vatRate);
  const total = goodsToman + freight + handling + insurance + cfg.scaleFee + vat;
  return { freight, handling, insurance, scale: cfg.scaleFee, vat, total, delivery: deliveryLabel(km) };
}

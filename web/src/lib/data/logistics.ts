/**
 * Landed-cost model — همهٔ سفارش‌ها از «انبار شادآباد تهران» ارسال می‌شوند.
 * Benchmarked against 1403–1404 market data:
 * - Road freight index (ستاد تنظیم بازار): ~1,100 Toman per ton-km for full
 *   trailer loads; short hauls carry a minimum trip charge (~2.5M Toman).
 * - Loading + unloading (بارگیری/تخلیه): ~150,000 Toman per ton combined.
 * - Domestic cargo insurance (بیمهٔ بار): ~0.25% of goods value.
 * - Weighbridge (باسکول): flat per truck.
 * - VAT comes from CONSTANTS.VAT_RATE (10%).
 * All figures are estimates for the mock era; admin-configurable later.
 */
export const ORIGIN_LABEL = 'انبار شادآباد تهران';

export const FREIGHT_RATE_PER_TON_KM = 1100; // Toman
export const FREIGHT_MIN_TRIP = 2_500_000; // Toman per trip
export const HANDLING_PER_TON = 150_000; // بارگیری + تخلیه
export const INSURANCE_RATE = 0.0025; // 0.25% of goods value
export const SCALE_FEE = 75_000; // باسکول, flat

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

export function cityDistance(name: string | null | undefined): number | null {
  return CITIES.find((c) => c.name === name)?.km ?? null;
}

/** Delivery estimate by road distance (working days; ~1404 trucking norms). */
export function deliveryLabel(km: number): string {
  if (km < 150) return 'همان روز تا ۱ روز کاری';
  if (km < 400) return '۱ تا ۲ روز کاری';
  if (km < 700) return '۲ تا ۳ روز کاری';
  if (km < 1000) return '۳ تا ۴ روز کاری';
  return '۴ تا ۵ روز کاری';
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

/** Full landed-cost estimate for `tons` of goods worth `goodsToman`, shipped to a city `km` away. */
export function estimateLogistics(
  tons: number,
  km: number,
  goodsToman: number,
  vatRate: number,
): LogisticsEstimate {
  const freight = Math.round(Math.max(FREIGHT_MIN_TRIP, tons * km * FREIGHT_RATE_PER_TON_KM));
  const handling = Math.round(tons * HANDLING_PER_TON);
  const insurance = Math.round(goodsToman * INSURANCE_RATE);
  const vat = Math.round(goodsToman * vatRate);
  const total = goodsToman + freight + handling + insurance + SCALE_FEE + vat;
  return { freight, handling, insurance, scale: SCALE_FEE, vat, total, delivery: deliveryLabel(km) };
}

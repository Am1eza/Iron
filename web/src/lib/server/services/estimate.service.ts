/**
 * Grounded estimates — item totals from live prices, the project heuristic
 * (rebar tonnage from area×floors) and the landed-cost model driven by the
 * admin-configurable LOGISTICS settings. The AI tools call these too, so
 * every number a user sees has one source.
 */
import { eq, inArray } from 'drizzle-orm';
import { getDb } from '@/lib/server/db/client';
import { skus, currentPrices, categories } from '@/lib/server/db/schema';
import type { LineItem, PriceUnit } from '@/lib/types/domain';
import { getSetting, getVatRate } from '@/lib/server/repos/settingsRepo';

export async function estimateItems(items: Array<{ skuId: string; qty: number; unit: PriceUnit }>) {
  const db = getDb();
  const ids = items.map((i) => i.skuId);
  const rows = await db
    .select({ sku: skus, price: currentPrices })
    .from(skus)
    .leftJoin(currentPrices, eq(currentPrices.skuId, skus.id))
    .where(inArray(skus.id, ids));
  const byId = new Map(rows.map((r) => [r.sku.id, r] as const));
  for (const r of rows) byId.set(r.sku.slug, r);

  const lines: LineItem[] = items.map((item) => {
    const hit = byId.get(item.skuId);
    const unitPrice = hit?.price?.price;
    const weightKg =
      item.unit === 'kg'
        ? item.qty
        : hit?.sku.theoreticalWeightKg
          ? Math.round(hit.sku.theoreticalWeightKg * item.qty * 100) / 100
          : undefined;
    return {
      skuId: hit?.sku.id ?? item.skuId,
      name: hit?.sku.name ?? item.skuId,
      qty: item.qty,
      unit: item.unit,
      weightKg,
      unitPrice,
      lineTotal: unitPrice ? Math.round(unitPrice * item.qty) : undefined,
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

/** Residential-skeleton heuristic (matches the برآورد پروژه tool): ~32kg rebar/m². */
const REBAR_KG_PER_M2 = 32;

export async function estimateProject(areaM2: number, floors: number) {
  const totalArea = areaM2 * floors;
  const rebarKg = Math.round(totalArea * REBAR_KG_PER_M2);
  // Average current rebar price (fresh rows only) grounds the cost band.
  const db = getDb();
  const rows = await db
    .select({ price: currentPrices.price })
    .from(currentPrices)
    .innerJoin(skus, eq(currentPrices.skuId, skus.id))
    .innerJoin(categories, eq(skus.categoryId, categories.id))
    .where(eq(categories.slug, 'rebar'))
    .limit(200);
  const avg = rows.length > 0 ? Math.round(rows.reduce((s, r) => s + r.price, 0) / rows.length) : 0;
  const rebarCost = avg > 0 ? rebarKg * avg : undefined;
  return {
    totalAreaM2: totalArea,
    rebarKg,
    rebarTons: Math.round((rebarKg / 1000) * 10) / 10,
    avgRebarPricePerKg: avg || undefined,
    rebarCost,
  };
}

interface LogisticsSettings {
  originLabel: string;
  freightRatePerTonKm: number;
  freightMinTrip: number;
  handlingPerTon: number;
  insuranceRate: number;
  scaleFee: number;
  cities: { name: string; km: number }[];
}

const LOGISTICS_FALLBACK: LogisticsSettings = {
  originLabel: 'انبار شادآباد تهران',
  freightRatePerTonKm: 1100,
  freightMinTrip: 2_500_000,
  handlingPerTon: 150_000,
  insuranceRate: 0.0025,
  scaleFee: 75_000,
  cities: [{ name: 'تهران', km: 15 }],
};

export async function landedCost(tons: number, city: string, goodsToman: number) {
  const [cfg, vatRate] = await Promise.all([
    getSetting<LogisticsSettings>('LOGISTICS', LOGISTICS_FALLBACK),
    getVatRate(),
  ]);
  const km = cfg.cities.find((c) => c.name === city.trim())?.km ?? 150;
  const freight = Math.round(Math.max(cfg.freightMinTrip, tons * km * cfg.freightRatePerTonKm));
  const handling = Math.round(tons * cfg.handlingPerTon);
  const insurance = Math.round(goodsToman * cfg.insuranceRate);
  const vat = Math.round(goodsToman * vatRate);
  const total = goodsToman + freight + handling + insurance + cfg.scaleFee + vat;
  return { freight, handling, insurance, scale: cfg.scaleFee, vat, total, km, origin: cfg.originLabel };
}

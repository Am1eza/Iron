/**
 * Idempotent database seeder — populates the catalog (7 categories, real
 * sub-taxonomy, benchmarked SKUs + prices + 90-day history), market values,
 * articles, settings and the dev admin. Reuses the deterministic mock
 * generator so live mode boots with the same realistic data the frontend
 * was built against.
 *
 * Shared by `scripts/seed.ts` (CLI / container) and the test helpers.
 * Re-running upserts by slug/key — it never duplicates and never overwrites
 * admin-edited prices unless `force` is set.
 */
import { sql } from 'drizzle-orm';
import { ulid } from 'ulid';

import * as schema from './schema';
import type { Db } from './client';
import { categories as categoryFixtures, marketValues } from '@/lib/mock/fixtures';
import { CATEGORY_SUBS } from '@/lib/data/nav';
import { rowsByCategory, priceSeries, articles as articleFixtures } from '@/lib/mock/catalogData';
import {
  FREIGHT_RATE_PER_TON_KM,
  FREIGHT_MIN_TRIP,
  HANDLING_PER_TON,
  INSURANCE_RATE,
  SCALE_FEE,
  CITIES,
  ORIGIN_LABEL,
} from '@/lib/data/logistics';
import { CONSTANTS } from '@/lib/config/constants';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SeedOptions {
  /** Redo SKU rows + history even when the catalog is non-empty. */
  force?: boolean;
  /** History depth in daily points (default 90). */
  historyDays?: number;
  log?: (msg: string) => void;
}

export async function seedDatabase(db: Db, opts: SeedOptions = {}): Promise<void> {
  const { force = false, historyDays = 90, log = () => {} } = opts;

  /* ---------- dev admin ---------- */
  const adminMobile = process.env.DEV_ADMIN_MOBILE ?? '09120000000';
  await db
    .insert(schema.users)
    .values({ id: 'u-admin', mobile: adminMobile, name: 'مدیر سیستم', role: 'admin' })
    .onConflictDoNothing();
  log(`dev admin ${adminMobile}`);

  /* ---------- categories & sub-categories ---------- */
  const subIdBySlug = new Map<string, string>(); // `${catSlug}/${subSlug}` -> id
  for (const c of categoryFixtures) {
    await db
      .insert(schema.categories)
      .values({ id: c.id, slug: c.slug, name: c.name, order: c.order, iconId: c.iconId, isActive: true })
      .onConflictDoUpdate({
        target: schema.categories.slug,
        set: { name: c.name, order: c.order, iconId: c.iconId },
      });
    const subs = CATEGORY_SUBS[c.slug] ?? [];
    let order = 0;
    for (const s of subs) {
      const id = `${c.id}-${s.slug}`;
      await db
        .insert(schema.subCategories)
        .values({ id, categoryId: c.id, slug: s.slug, name: s.name, order: ++order, isActive: true })
        .onConflictDoUpdate({
          target: [schema.subCategories.categoryId, schema.subCategories.slug],
          set: { name: s.name, order },
        });
      subIdBySlug.set(`${c.slug}/${s.slug}`, id);
    }
  }
  log('categories + subs');

  /* ---------- SKUs, current prices, history ---------- */
  const existing = await db.select({ n: sql<number>`count(*)::int` }).from(schema.skus);
  const skusEmpty = (existing[0]?.n ?? 0) === 0;
  if (!skusEmpty && !force) {
    log('SKUs already present — skipping catalog rows (force to redo).');
  } else {
    let skuCount = 0;
    let pointCount = 0;
    for (const c of categoryFixtures) {
      const rows = rowsByCategory[c.slug] ?? [];
      for (const row of rows) {
        const subId = subIdBySlug.get(`${c.slug}/${row.subCategoryId}`);
        if (!subId) continue;
        await db
          .insert(schema.skus)
          .values({
            id: row.slug,
            subCategoryId: subId,
            categoryId: c.id,
            slug: row.slug,
            name: row.name,
            standard: row.standard,
            size: row.size,
            grade: row.grade,
            factory: row.factory,
            theoreticalWeightKg: row.theoreticalWeightKg,
            unit: row.unit,
            isActive: true,
          })
          .onConflictDoUpdate({ target: schema.skus.slug, set: { name: row.name, factory: row.factory } });

        const cur = row.current;
        await db
          .insert(schema.currentPrices)
          .values({
            skuId: row.slug,
            price: cur.price,
            unit: cur.unit,
            deliveryTime: cur.deliveryTime,
            vatIncluded: cur.vatIncluded,
            movementPct: cur.movementPct,
            movementDir: cur.movementDir,
            updatedAt: new Date(),
            updatedBy: 'u-admin',
            isStale: false,
          })
          .onConflictDoUpdate({
            target: schema.currentPrices.skuId,
            set: { price: cur.price, updatedAt: new Date(), isStale: false },
          });

        // Daily history ending at today's price.
        const series = priceSeries(row.slug, cur.price, historyDays);
        const now = Date.now();
        const points = series.map((p, i) => ({
          id: ulid(),
          skuId: row.slug,
          price: p,
          unit: cur.unit,
          at: new Date(now - (series.length - 1 - i) * DAY_MS),
        }));
        if (force) {
          await db.delete(schema.pricePoints).where(sql`${schema.pricePoints.skuId} = ${row.slug}`);
        }
        for (let i = 0; i < points.length; i += 200) {
          await db.insert(schema.pricePoints).values(points.slice(i, i + 200));
        }
        skuCount++;
        pointCount += points.length;
      }
    }
    log(`${skuCount} SKUs, ${pointCount} price points`);
  }

  /* ---------- market values + short history ---------- */
  for (const m of marketValues) {
    await db
      .insert(schema.marketValues)
      .values({
        key: m.key,
        label: m.label,
        value: m.value,
        unit: m.unit,
        source: m.source,
        movementDir: m.movementDir,
        movementPct: m.movementPct,
        updatedAt: new Date(),
        isStale: false,
      })
      .onConflictDoNothing(); // live tgju polling owns these afterwards
    const havePoints = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.marketPoints)
      .where(sql`${schema.marketPoints.key} = ${m.key}`);
    if ((havePoints[0]?.n ?? 0) === 0) {
      const series = priceSeries(`market:${m.key}`, m.value, historyDays);
      const now = Date.now();
      await db.insert(schema.marketPoints).values(
        series.map((v, i) => ({
          id: ulid(),
          key: m.key,
          value: v,
          at: new Date(now - (series.length - 1 - i) * DAY_MS),
        })),
      );
    }
  }
  log('market values');

  /* ---------- articles ---------- */
  for (const a of articleFixtures) {
    await db
      .insert(schema.articles)
      .values({
        id: a.id,
        slug: a.slug,
        type: a.type,
        title: a.title,
        excerpt: a.excerpt,
        bodyMd: a.excerpt ? `${a.excerpt}\n\n(متن کامل این مقاله به‌زودی تکمیل می‌شود.)` : '',
        status: a.status,
        source: a.source,
        publishAt: a.publishAt ? new Date(a.publishAt) : null,
      })
      .onConflictDoNothing();
  }
  log(`${articleFixtures.length} articles`);

  /* ---------- settings (admin-configurable business rules) ---------- */
  const settingsSeed: Record<string, unknown> = {
    VAT_RATE: CONSTANTS.VAT_RATE,
    PRICE_STALE_HIDE_AFTER_DAYS: CONSTANTS.PRICE_STALE_HIDE_AFTER_DAYS,
    QUOTE_VALIDITY_HOUR: 11,
    HOLIDAYS: [], // Jalali dates 'yyyy-MM-dd' — admin-editable
    CLUB_TIERS: {
      iron: { name: 'آهنی', minLeads: 0 },
      steel: { name: 'فولادی', minLeads: 3 },
      poolad: { name: 'پولادی', minLeads: 10 },
    },
    LOGISTICS: {
      originLabel: ORIGIN_LABEL,
      freightRatePerTonKm: FREIGHT_RATE_PER_TON_KM,
      freightMinTrip: FREIGHT_MIN_TRIP,
      handlingPerTon: HANDLING_PER_TON,
      insuranceRate: INSURANCE_RATE,
      scaleFee: SCALE_FEE,
      cities: CITIES,
    },
    ALERT_MAX_ACTIVE_PER_USER: 20,
  };
  for (const [key, value] of Object.entries(settingsSeed)) {
    await db
      .insert(schema.settings)
      .values({ key, value, updatedAt: new Date() })
      .onConflictDoNothing(); // never clobber admin-edited settings
  }
  log('settings');
}

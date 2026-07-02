// @vitest-environment node
/**
 * P4 integration — alerts fire on crossings (SMS-logged, one-shot), favorites
 * round-trip as PriceRows, club tiers advance with won leads.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '@/test/db';
import { seedDatabase } from '@/lib/server/db/seed';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import { tableRows } from '@/lib/server/repos/catalogRepo';
import { createAlert, alertsForUser } from '@/lib/server/repos/alertsRepo';
import { evaluateAlerts } from '@/lib/server/services/alerts.service';
import { addFavorite, favoritesForUser, removeFavorite } from '@/lib/server/repos/favoritesRepo';
import { joinClub, clubStatus, recomputeTier } from '@/lib/server/repos/clubRepo';
import { insertLead, updateLead } from '@/lib/server/repos/leadsRepo';
import { savePrice } from '@/lib/server/services/pricing.service';

let db: Db;
let close: () => Promise<void>;
const USER = 'u-admin';

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await seedDatabase(db, { historyDays: 2 });
}, 120_000);
afterAll(async () => {
  await close();
});

describe('alerts', () => {
  it('fires once when the price crosses the threshold, then stays triggered', async () => {
    const rows = await tableRows('rebar');
    const sku = rows[0]!;
    await createAlert({
      userId: USER,
      target: { type: 'sku', skuId: sku.id },
      op: 'below',
      threshold: sku.current.price - 5000, // not crossed yet
      channel: 'sms',
    });

    expect(await evaluateAlerts()).toBe(0);

    // Price drops below the threshold → the alert fires.
    await savePrice(USER, { skuId: sku.id, price: sku.current.price - 6000 });
    expect(await evaluateAlerts()).toBe(1);

    const mine = await alertsForUser(USER);
    const fired = mine.find((a) => a.target.type === 'sku');
    expect(fired?.status).toBe('triggered');
    expect(fired?.target.label).toBe(sku.name);

    // One-shot: a second evaluation doesn't re-fire.
    expect(await evaluateAlerts()).toBe(0);

    const sms = await db.select().from(schema.smsLog).where(eq(schema.smsLog.kind, 'alert'));
    expect(sms.length).toBe(1);
    expect(sms[0]!.status).toBe('dev_logged');
  });
});

describe('favorites', () => {
  it('adds by slug, lists as PriceRows, removes', async () => {
    const rows = await tableRows('ibeam');
    const sku = rows[0]!;
    expect(await addFavorite(USER, sku.slug)).toBe(true);
    expect(await addFavorite(USER, sku.slug)).toBe(true); // idempotent

    const favs = await favoritesForUser(USER);
    expect(favs).toHaveLength(1);
    expect(favs[0]!.slug).toBe(sku.slug);
    expect(favs[0]!.current.price).toBeGreaterThan(0);

    await removeFavorite(USER, sku.slug);
    expect(await favoritesForUser(USER)).toHaveLength(0);
  });
});

describe('club', () => {
  it('joins at iron and advances to steel after 3 won leads', async () => {
    await joinClub(USER);
    let status = await clubStatus(USER);
    expect(status.tier).toBe('iron');

    for (let i = 0; i < 3; i++) {
      const lead = await insertLead({
        ref: `LD-WON-${i}`,
        userId: USER,
        contactMobile: '09120000000',
        contactVerified: true,
        source: 'cart',
        items: [],
      });
      await updateLead(lead.id, { status: 'won' });
    }
    const tier = await recomputeTier(USER);
    expect(tier).toBe('steel');
    status = await clubStatus(USER);
    expect(status.wonLeads).toBe(3);
    expect(status.nextTier?.tier).toBe('poolad');
  });
});

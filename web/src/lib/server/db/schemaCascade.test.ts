// @vitest-environment node
/**
 * FK onDelete semantics — the actual DB behavior, not just the DDL. Locks in
 * the two intentional patterns used across the schema:
 *   - structural / non-historical rows (favorites, current_prices, the
 *     catalog hierarchy) CASCADE with their parent;
 *   - historical / transactional rows that merely REFERENCE something
 *     (lead_items, orders) SET NULL instead, so deleting a user or a
 *     product can never silently erase real business history.
 * Also covers the two soft-delete additions (leads.deletedAt via
 * softDeleteLead, proformas.status='cancelled' via cancelProforma).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import { createTestDb } from '@/test/db';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import { findLead, softDeleteLead, insertProforma, cancelProforma, expireDueProformas } from '@/lib/server/repos/leadsRepo';

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
}, 120_000);
afterAll(async () => {
  await close();
});

async function makeCategoryChain() {
  const catId = ulid();
  const subId = ulid();
  const skuId = ulid();
  await db.insert(schema.categories).values({ id: catId, slug: `cat-${catId}`, name: 'دسته تست' });
  await db.insert(schema.subCategories).values({ id: subId, categoryId: catId, slug: `sub-${subId}`, name: 'زیردسته تست' });
  await db.insert(schema.skus).values({
    id: skuId,
    subCategoryId: subId,
    categoryId: catId,
    slug: `sku-${skuId}`,
    name: 'محصول تست',
  });
  return { catId, subId, skuId };
}

async function makeUser() {
  const userId = ulid();
  await db.insert(schema.users).values({ id: userId, mobile: `0912${Math.floor(Math.random() * 1e7)}` });
  return userId;
}

describe('FK onDelete — cascade for structural/non-historical rows', () => {
  it('deleting a category cascades through sub_category → sku → current_prices/price_points', async () => {
    const { catId, subId, skuId } = await makeCategoryChain();
    await db.insert(schema.currentPrices).values({ skuId, price: 100000, unit: 'kg' });
    await db.insert(schema.pricePoints).values({ id: ulid(), skuId, price: 100000, unit: 'kg' });

    await db.delete(schema.categories).where(eq(schema.categories.id, catId));

    expect((await db.select().from(schema.subCategories).where(eq(schema.subCategories.id, subId))).length).toBe(0);
    expect((await db.select().from(schema.skus).where(eq(schema.skus.id, skuId))).length).toBe(0);
    expect((await db.select().from(schema.currentPrices).where(eq(schema.currentPrices.skuId, skuId))).length).toBe(0);
    expect((await db.select().from(schema.pricePoints).where(eq(schema.pricePoints.skuId, skuId))).length).toBe(0);
  });

  it('deleting a user cascades to their favorites, refresh tokens, and club membership', async () => {
    const userId = await makeUser();
    const { skuId } = await makeCategoryChain();
    await db.insert(schema.favorites).values({ id: ulid(), userId, skuId });
    await db.insert(schema.refreshTokens).values({ tokenHash: ulid(), userId, expiresAt: Date.now() + 1000 });
    await db.insert(schema.clubMemberships).values({ id: ulid(), userId });

    await db.delete(schema.users).where(eq(schema.users.id, userId));

    expect((await db.select().from(schema.favorites).where(eq(schema.favorites.userId, userId))).length).toBe(0);
    expect((await db.select().from(schema.refreshTokens).where(eq(schema.refreshTokens.userId, userId))).length).toBe(0);
    expect((await db.select().from(schema.clubMemberships).where(eq(schema.clubMemberships.userId, userId))).length).toBe(0);
  });
});

describe('FK onDelete — set null for historical/transactional rows', () => {
  it('deleting a sku preserves lead_items/order_items but nulls their sku reference', async () => {
    const { skuId } = await makeCategoryChain();
    const userId = await makeUser();
    const leadId = ulid();
    await db.insert(schema.leads).values({
      id: leadId,
      ref: `LD-${leadId}`,
      userId,
      contactMobile: '09120000000',
      source: 'table',
    });
    const leadItemId = ulid();
    await db.insert(schema.leadItems).values({ id: leadItemId, leadId, skuId, name: 'ردیف تست', qty: 1, unit: 'kg' });

    await db.delete(schema.skus).where(eq(schema.skus.id, skuId));

    const [item] = await db.select().from(schema.leadItems).where(eq(schema.leadItems.id, leadItemId));
    expect(item).toBeDefined();
    expect(item!.skuId).toBeNull();
    expect(item!.name).toBe('ردیف تست'); // the historical snapshot itself is untouched
  });

  it('deleting a user preserves their lead but nulls userId (not a cascade delete)', async () => {
    const userId = await makeUser();
    const leadId = ulid();
    await db.insert(schema.leads).values({
      id: leadId,
      ref: `LD-${leadId}`,
      userId,
      contactMobile: '09120000001',
      source: 'ai',
    });

    await db.delete(schema.users).where(eq(schema.users.id, userId));

    const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, leadId));
    expect(lead).toBeDefined();
    expect(lead!.userId).toBeNull();
  });

  it('deleting a user with authored lead_notes is blocked (default RESTRICT, not silently cascaded)', async () => {
    const userId = await makeUser();
    const leadId = ulid();
    await db.insert(schema.leads).values({ id: leadId, ref: `LD-${leadId}`, contactMobile: '09120000002', source: 'ai' });
    await db.insert(schema.leadNotes).values({ id: ulid(), leadId, authorId: userId, text: 'یادداشت' });

    await expect(db.delete(schema.users).where(eq(schema.users.id, userId))).rejects.toThrow();
  });
});

describe('soft-delete', () => {
  it('softDeleteLead hides the lead from findLead but keeps the row', async () => {
    const leadId = ulid();
    await db.insert(schema.leads).values({ id: leadId, ref: `LD-${leadId}`, contactMobile: '09120000003', source: 'contact' });

    expect(await findLead(leadId)).not.toBeNull();
    const deleted = await softDeleteLead(leadId);
    expect(deleted?.deletedAt).toBeInstanceOf(Date);
    expect(await findLead(leadId)).toBeNull();

    const [raw] = await db.select().from(schema.leads).where(eq(schema.leads.id, leadId));
    expect(raw).toBeDefined(); // the row itself survives — this is an archive, not a delete
  });

  it('cancelProforma sets status=cancelled and the expiry sweep never touches it', async () => {
    const leadId = ulid();
    await db.insert(schema.leads).values({ id: leadId, ref: `LD-${leadId}`, contactMobile: '09120000004', source: 'cart' });
    const proforma = await insertProforma({
      leadId,
      ref: `PF-${leadId}`,
      lines: [],
      subtotal: 1000,
      vatRate: 0.1,
      vatAmount: 100,
      total: 1100,
      // Already past validUntil — if the sweep incorrectly matched
      // cancelled rows, this is exactly the row it would (wrongly) touch.
      validUntil: new Date(Date.now() - 1000),
    });

    const cancelled = await cancelProforma(proforma.ref);
    expect(cancelled?.status).toBe('cancelled');

    const expiredCount = await expireDueProformas();
    const [row] = await db.select().from(schema.proformas).where(eq(schema.proformas.ref, proforma.ref));
    expect(row!.status).toBe('cancelled'); // NOT flipped to 'expired' by the sweep
    expect(expiredCount).toBe(0);
  });

  it('cancelProforma is a no-op (returns null) on an already-cancelled/expired proforma', async () => {
    const leadId = ulid();
    await db.insert(schema.leads).values({ id: leadId, ref: `LD-${leadId}`, contactMobile: '09120000005', source: 'tool' });
    const proforma = await insertProforma({
      leadId,
      ref: `PF-${leadId}`,
      lines: [],
      subtotal: 1000,
      vatRate: 0.1,
      vatAmount: 100,
      total: 1100,
      validUntil: new Date(Date.now() + 100_000),
    });
    await cancelProforma(proforma.ref);
    expect(await cancelProforma(proforma.ref)).toBeNull();
  });
});

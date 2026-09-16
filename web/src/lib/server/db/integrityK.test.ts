// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { createTestDb } from '@/test/db';
import type { Db } from './client';
import * as s from './schema';
import { seedDatabase } from './seed';
import { updateLead } from '@/lib/server/repos/leadsRepo';
import { businessOperation } from '@/lib/server/utils/businessOperation';
import { savePrice } from '@/lib/server/services/pricing.service';
import { databasePoolConfig } from './poolConfig';
let db: Db, close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(s.users).values({ id: 'k-user', mobile: '09990000000', role: 'admin' });
  await db.insert(s.categories).values({ id: 'k-cat', slug: 'k-cat', name: 'test' });
  await db.insert(s.subCategories).values({ id: 'k-sub', slug: 'k-sub', categoryId: 'k-cat', name: 'test' });
  await db.insert(s.skus).values({ id: 'k-sku', slug: 'k-sku', categoryId: 'k-cat', subCategoryId: 'k-sub', name: 'test', unit: 'kg' });
}, 120000);
afterAll(async () => { vi.unstubAllEnvs(); await close(); });

describe('K database integrity', () => {
  it('rejects missing target, negative threshold, invalid op and wrong target combinations', async () => {
    const base = { id: 'k-alert', userId: 'k-user', targetType: 'sku' as const, skuId: 'k-sku', op: 'below' as const, threshold: 100 };
    for (const patch of [{ skuId: null }, { threshold: -1 }, { op: 'invalid' }, { marketKey: 'usd' }]) {
      await expect(db.insert(s.alerts).values({ ...base, ...patch } as typeof base)).rejects.toThrow();
    }
    await db.insert(s.alerts).values(base);
    await expect(db.insert(s.alerts).values({ ...base, id: 'k-duplicate' })).rejects.toThrow();
  });
  it('rejects stale CRM edits, including after an unrelated direct SQL update', async () => {
    await db.insert(s.leads).values({ id: 'k-lead', ref: 'K-LEAD', contactMobile: '09990000000', source: 'contact' });
    const results = await Promise.all([
      updateLead('k-lead', { status: 'contacted' }, { expectedVersion: 1 }),
      updateLead('k-lead', { status: 'lost' }, { expectedVersion: 1 }),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    await db.execute(sql`UPDATE leads SET contact_verified=true WHERE id='k-lead'`);
    expect(await updateLead('k-lead', { status: 'new' }, { expectedVersion: 2 })).toBeNull();
  });
  it('commits one logical operation across 20 competing writers', async () => {
    let runs = 0;
    const results = await Promise.all(Array.from({ length: 20 }, () => businessOperation('k-once', { x: 1 }, async tx => {
      runs++;
      await tx.insert(s.settings).values({ key: 'k-effect', value: true });
      return { done: true };
    })));
    expect(runs).toBe(1);
    expect(results.every(r => r.done)).toBe(true);
  });
  it('serializes first price writes and deduplicates a repeated source event', async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => savePrice('k-user', { skuId: 'k-sku', price: 100000, unit: 'kg', sourceEventKey: 'k-price-once' })));
    expect(results.filter(r => r.changed)).toHaveLength(1);
    expect(await db.select().from(s.pricePoints).where(eq(s.pricePoints.skuId, 'k-sku'))).toHaveLength(1);
  });
  it('rejects every fixture seed in production, including force', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    try { await expect(seedDatabase(db, { force: true })).rejects.toThrow('forbidden'); }
    finally { vi.unstubAllEnvs(); }
  });
  it('bounds query duration and rejects a connection budget overflow', () => {
    expect(databasePoolConfig('postgres://localhost/test').statement_timeout).toBeGreaterThan(0);
    vi.stubEnv('PG_POOL_MAX', '50');
    try { expect(() => databasePoolConfig('postgres://localhost/test')).toThrow('budget'); }
    finally { vi.unstubAllEnvs(); }
  });
  it('accepts the production host\'s real WEB_CONCURRENCY against the default budget', () => {
    // .env.example's own math for the deployed 8-core host: WEB_CONCURRENCY=5
    // with the default PG_POOL_MAX=10 -> 60 connections, well under
    // max_connections=100. This must not throw with no other env override —
    // it did in production once (replicas defaulted to 2, an unrelated
    // blue/green assumption this single-instance-recreate deploy never
    // matches), which took the site down until rolled back.
    vi.stubEnv('WEB_CONCURRENCY', '5');
    try { expect(() => databasePoolConfig('postgres://localhost/test')).not.toThrow(); }
    finally { vi.unstubAllEnvs(); }
  });
});

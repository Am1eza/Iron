// @vitest-environment node
/**
 * searchSkus ranking (US-audit.5) — real Postgres (pglite) with pg_trgm,
 * same reasoning as this directory's other `.pg.test.ts` files: `similarity()`
 * is a real trigram function no mocked DB can exercise honestly.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '@/test/db';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import { searchSkus } from './catalogRepo';

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(schema.categories).values([{ id: 'cat-rebar', slug: 'rebar', name: 'میلگرد', order: 0 }]);
  await db.insert(schema.subCategories).values([
    // Ribbed rebar (میلگرد آجدار) is the common, high-traffic sub-category —
    // lower `order`, same admin-set popularity/display signal the taxonomy
    // rail already sorts by. Steel-variant rebar (میلگرد استیل) is niche.
    { id: 'sub-ajdar', categoryId: 'cat-rebar', slug: 'ajdar', name: 'میلگرد آجدار', order: 0 },
    { id: 'sub-steel', categoryId: 'cat-rebar', slug: 'steel', name: 'میلگرد استیل', order: 5 },
  ]);
  await db.insert(schema.skus).values([
    // Two names measured (see PR description) to have the EXACT SAME pg_trgm
    // similarity against the query below — a real tie, not an approximation —
    // so which one sorts first depends entirely on the order tie-break.
    {
      id: 'sku-ajdar-14',
      categoryId: 'cat-rebar',
      subCategoryId: 'sub-ajdar',
      slug: 'ajdar-14',
      name: 'میلگرد آجدار سایز 14',
      size: '14',
    },
    {
      id: 'sku-steel-14',
      categoryId: 'cat-rebar',
      subCategoryId: 'sub-steel',
      slug: 'steel-14',
      name: 'میلگرد استیل سایز 14',
      size: '14',
    },
  ]);
}, 120_000);

afterAll(async () => {
  await close();
});

describe('searchSkus', () => {
  it('breaks an exact text-similarity tie toward the common sub-category (lower order)', async () => {
    const rows = await searchSkus('میلگرد 14');
    const slugs = rows.map((r) => r.slug);
    expect(slugs).toContain('ajdar-14');
    expect(slugs).toContain('steel-14');
    expect(slugs.indexOf('ajdar-14')).toBeLessThan(slugs.indexOf('steel-14'));
  });
});

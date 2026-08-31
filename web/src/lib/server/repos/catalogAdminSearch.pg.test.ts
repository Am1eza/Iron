// @vitest-environment node
/**
 * The catalog panel's search box normalized what it WROTE and not what it
 * READ, so it could not find the product the very same form had just saved.
 *
 * `api/admin/catalog/skus` runs every free-text field through
 * `normalizePersian` on create and update — Arabic ك/ي become Persian ک/ی,
 * tatweel and harakat are dropped, Arabic-Indic digits become Persian ones.
 * That normalization exists precisely so an Excel paste does not become
 * permanently unsearchable. `adminListSkus` then ILIKE'd the admin's raw
 * keystrokes against those normalized columns, which is the same bug from the
 * other end: an admin who types «کارخانهٔ آزمایشی» (U+0654, an ordinary
 * Persian ezafe spelling, and a harakat as far as the normalizer is
 * concerned) gets «کالایی نیست» for the row it stored as «کارخانه آزمایشی».
 *
 * Found by an e2e assertion that was too loose to notice: it waited for
 * `tbody tr` to be visible, which the PRE-search rows already satisfied, then
 * read a badge off a row the search was about to replace.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '@/test/db';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import { adminListSkus } from './catalogAdminRepo';

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(schema.categories).values([
    { id: 'c-rebar', slug: 'rebar', name: 'میلگرد', order: 1, iconId: '', isActive: true },
  ]);
  await db.insert(schema.subCategories).values([
    { id: 's-plain', categoryId: 'c-rebar', slug: 'plain', name: 'ساده', order: 1, isActive: true },
  ]);
  const sku = (id: string, name: string, factory: string) => ({
    id,
    slug: id,
    subCategoryId: 's-plain',
    categoryId: 'c-rebar',
    name,
    factory,
    unit: 'kg' as const,
    isActive: true,
  });
  await db.insert(schema.skus).values([
    // Stored exactly as the create route writes it: normalized.
    sku('normalized', 'میلگرد ساده ۱۴', 'کارخانه آزمایشی'),
    // Predates the write-side normalization — Arabic ي and ك, still on disk.
    sku('legacy', 'ميلگرد كياني', 'كارخانه قديمي'),
  ]);
}, 120_000);

afterAll(async () => {
  await close();
});

describe('adminListSkus search normalization', () => {
  it('finds a normalized row from the un-normalized spelling an admin types', async () => {
    // The exact string the admin form offers back, hamza and all.
    const { rows } = await adminListSkus({ q: 'کارخانهٔ آزمایشی', status: 'active' });
    expect(rows.map((r) => r.sku.id)).toEqual(['normalized']);
  });

  it('matches across the Arabic/Persian ک and ی an Excel paste or iOS keyboard produces', async () => {
    const { rows } = await adminListSkus({ q: 'ميلگرد', status: 'active' });
    expect(rows.map((r) => r.sku.id)).toContain('normalized');
  });

  it('still finds rows written BEFORE normalization, by their own raw spelling', async () => {
    // Regression guard for the fix itself: normalizing the query must be an
    // ADDITIONAL term, never a replacement, or these rows become unfindable.
    const { rows } = await adminListSkus({ q: 'كارخانه قديمي', status: 'active' });
    expect(rows.map((r) => r.sku.id)).toEqual(['legacy']);
  });

  it('does not turn an unrelated query into a match', async () => {
    const { rows } = await adminListSkus({ q: 'ورق گالوانیزه', status: 'active' });
    expect(rows).toHaveLength(0);
  });
});

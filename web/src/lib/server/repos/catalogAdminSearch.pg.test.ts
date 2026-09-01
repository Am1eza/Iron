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
    { id: 'c-rebar', slug: 'rebar', name: 'میلگرد', order: 1, iconId: '' },
  ]);
  await db.insert(schema.subCategories).values([
    { id: 's-plain', categoryId: 'c-rebar', slug: 'plain', name: 'ساده', order: 1 },
  ]);
  const sku = (id: string, name: string, factory: string) => ({
    id,
    slug: id,
    subCategoryId: 's-plain',
    categoryId: 'c-rebar',
    name,
    factory,
    unit: 'kg' as const,
  });
  await db.insert(schema.skus).values([
    // Stored exactly as the create route writes it: normalized.
    sku('normalized', 'میلگرد ساده ۱۴', 'کارخانه آزمایشی'),
    // Predates the write-side normalization — Arabic ي and ك, still on disk.
    sku('legacy', 'ميلگرد كياني', 'كارخانه قديمي'),
    // Written with a half-space (U+200C), which is how «ذوب‌آهن» is spelled on
    // the mill's own site — and which no amount of write-side normalization
    // can rule out, because it is a legitimate spelling.
    sku('halfspace', 'میلگرد آجدار ۱۶', `ذوب${'\u200c'}آهن`),
    // The same mill, typed by a different admin with an ordinary space.
    sku('spaced', 'میلگرد آجدار ۱۸', 'ذوب آهن'),
  ]);
}, 120_000);

afterAll(async () => {
  await close();
});

describe('adminListSkus search normalization', () => {
  it('finds a normalized row from the un-normalized spelling an admin types', async () => {
    // The exact string the admin form offers back, hamza and all.
    const { rows } = await adminListSkus({ q: 'کارخانهٔ آزمایشی' });
    expect(rows.map((r) => r.sku.id)).toEqual(['normalized']);
  });

  it('matches across the Arabic/Persian ک and ی an Excel paste or iOS keyboard produces', async () => {
    const { rows } = await adminListSkus({ q: 'ميلگرد' });
    expect(rows.map((r) => r.sku.id)).toContain('normalized');
  });

  it('still finds rows written BEFORE normalization, by their own raw spelling', async () => {
    // Regression guard for the fix itself: normalizing the query must be an
    // ADDITIONAL term, never a replacement, or these rows become unfindable.
    const { rows } = await adminListSkus({ q: 'كارخانه قديمي' });
    expect(rows.map((r) => r.sku.id)).toEqual(['legacy']);
  });

  it('does not turn an unrelated query into a match', async () => {
    const { rows } = await adminListSkus({ q: 'ورق گالوانیزه' });
    expect(rows).toHaveLength(0);
  });
});

/**
 * The half-space, the one spelling axis `normalizePersian` never touched: JS
 * `\s` does not include U+200C, so «ذوب آهن» returned NOTHING for the product
 * stored as «ذوب‌آهن» — two strings that are indistinguishable on screen.
 */
/**
 * Word order — the failure that closes the duplicate-creation loop.
 *
 * Product names are COMPOSED (`composeSkuName` builds «میلگرد آجدار ۱۶» out of
 * separate parts), so the shortest phrase that identifies a product to a human
 * is almost never a contiguous substring of the stored name. One `%…%` per
 * query meant «میلگرد ۱۶» answered «کالایی نیست» for a product sitting right
 * there — and an admin who cannot find a product creates it again.
 */
describe('adminListSkus — multi-word search', () => {
  it('finds a composed name from words that are not adjacent in it', async () => {
    // «میلگرد آجدار ۱۶»: the two typed words are separated by a third.
    const { rows } = await adminListSkus({ q: 'میلگرد ۱۶' });
    expect(rows.map((r) => r.sku.id)).toEqual(['halfspace']);
  });

  it('matches tokens ACROSS columns — the name and the factory in one query', async () => {
    // «میلگرد» is in `name`, «ذوب آهن» is in `factory`; no single column holds
    // the whole phrase, which is exactly how an admin describes a product.
    const { rows } = await adminListSkus({ q: 'میلگرد ذوب آهن' });
    expect(rows.map((r) => r.sku.id).sort()).toEqual(['halfspace', 'spaced']);
  });

  it('normalizes each token independently, not the phrase as a whole', async () => {
    // Arabic ك in the first word, a Latin-keypad digit in the second: a
    // variant set built from the whole string cannot repair both at once.
    const { rows } = await adminListSkus({ q: 'ميلگرد 16' });
    expect(rows.map((r) => r.sku.id)).toEqual(['halfspace']);
  });

  it('requires EVERY token, so an extra word still narrows the result', async () => {
    // Not an OR: adding a word that matches nothing must return nothing, or
    // «میلگرد» would drag the whole catalogue back on every query.
    const { rows } = await adminListSkus({ q: 'میلگرد گالوانیزه' });
    expect(rows).toHaveLength(0);
  });

  it('still honours a contiguous phrase, which contains its own tokens', async () => {
    const { rows } = await adminListSkus({ q: 'میلگرد آجدار ۱۸' });
    expect(rows.map((r) => r.sku.id)).toEqual(['spaced']);
  });
});

describe('adminListSkus — half-space (ZWNJ)', () => {
  it('finds the half-space spelling from an ordinary space', async () => {
    const { rows } = await adminListSkus({ q: 'ذوب آهن' });
    expect(rows.map((r) => r.sku.id).sort()).toEqual(['halfspace', 'spaced']);
  });

  it('and the spaced spelling from a half-space', async () => {
    const { rows } = await adminListSkus({ q: `ذوب${'\u200c'}آهن` });
    expect(rows.map((r) => r.sku.id).sort()).toEqual(['halfspace', 'spaced']);
  });

  it('still does not match a mill that is not there', async () => {
    const { rows } = await adminListSkus({ q: `ذوب${'\u200c'}فولاد` });
    expect(rows).toHaveLength(0);
  });
});

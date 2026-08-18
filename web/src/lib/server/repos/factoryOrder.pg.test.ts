// @vitest-environment node
/**
 * Per-category factory ordering (US-18.2).
 *
 * The invariants worth pinning down are the ones that make the feature safe to
 * ship half-filled: an unordered category must read as "no opinion" (not "no
 * factories"), an ordered one must not leak its opinion into a sibling
 * category, and a stored name whose products have all gone away must stay
 * VISIBLE to the admin rather than quietly steering a sort nobody can find.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestDb } from '@/test/db';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import { factoriesForCategory, setFactoryOrder } from './catalogAdminRepo';
import { factoryOrderForCategory } from './catalogRepo';

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(schema.categories).values([
    { id: 'c-rebar', slug: 'rebar', name: 'میلگرد', order: 1, iconId: '', isActive: true },
    { id: 'c-sheet', slug: 'sheet', name: 'ورق', order: 2, iconId: '', isActive: true },
  ]);
  await db.insert(schema.subCategories).values([
    { id: 's-rebar', categoryId: 'c-rebar', slug: 'deformed', name: 'آجدار', order: 1, isActive: true },
    { id: 's-sheet', categoryId: 'c-sheet', slug: 'hot', name: 'گرم', order: 1, isActive: true },
  ]);
  const sku = (id: string, catId: string, subId: string, factory: string, isActive = true) => ({
    id,
    subCategoryId: subId,
    categoryId: catId,
    slug: id,
    name: `کالا ${id}`,
    factory,
    unit: 'kg' as const,
    isActive,
  });
  await db.insert(schema.skus).values([
    sku('r1', 'c-rebar', 's-rebar', 'ذوب‌آهن اصفهان'),
    sku('r2', 'c-rebar', 's-rebar', 'ذوب‌آهن اصفهان'),
    sku('r3', 'c-rebar', 's-rebar', 'نیشابور'),
    sku('r4', 'c-rebar', 's-rebar', 'ابرکوه'),
    // Retired — its factory must not appear as a live option.
    sku('r5', 'c-rebar', 's-rebar', 'کارخانهٔ بازنشسته', false),
    // Same mill name, other category: the two lists must stay independent.
    sku('h1', 'c-sheet', 's-sheet', 'فولاد مبارکه'),
    sku('h2', 'c-sheet', 's-sheet', 'ذوب‌آهن اصفهان'),
  ]);
}, 120_000);

afterAll(async () => {
  await close();
});

beforeEach(async () => {
  await db.delete(schema.factoryOrder);
});

describe('factoriesForCategory', () => {
  it('lists a never-ordered category alphabetically, with every order null', async () => {
    const rows = await factoriesForCategory('c-rebar');
    // «کارخانهٔ بازنشسته» has only an inactive SKU — a customer can never see
    // it, so offering it as something to arrange would be a lie.
    expect(rows.map((r) => r.factory)).toEqual(['ابرکوه', 'ذوب‌آهن اصفهان', 'نیشابور']);
    expect(rows.every((r) => r.order === null)).toBe(true);
    expect(rows.find((r) => r.factory === 'ذوب‌آهن اصفهان')!.skuCount).toBe(2);
  });

  it('puts the arranged block first and leaves the rest behind it', async () => {
    await setFactoryOrder('c-rebar', ['نیشابور', 'ذوب‌آهن اصفهان']);
    const rows = await factoriesForCategory('c-rebar');
    expect(rows.map((r) => [r.factory, r.order])).toEqual([
      ['نیشابور', 1],
      ['ذوب‌آهن اصفهان', 2],
      ['ابرکوه', null],
    ]);
  });

  it('keeps a stored name whose products have all gone, marked as empty', async () => {
    await setFactoryOrder('c-rebar', ['کارخانهٔ حذف‌شده', 'نیشابور']);
    const rows = await factoriesForCategory('c-rebar');
    const stale = rows.find((r) => r.factory === 'کارخانهٔ حذف‌شده');
    // Present, ordered, and honestly reported as backing nothing — the admin
    // can only clear what they can see.
    expect(stale).toEqual({ factory: 'کارخانهٔ حذف‌شده', order: 1, skuCount: 0 });
  });
});

describe('setFactoryOrder', () => {
  it('replaces the whole list rather than merging into it', async () => {
    await setFactoryOrder('c-rebar', ['ابرکوه', 'نیشابور', 'ذوب‌آهن اصفهان']);
    await setFactoryOrder('c-rebar', ['ذوب‌آهن اصفهان']);
    expect(await factoryOrderForCategory('rebar')).toEqual(['ذوب‌آهن اصفهان']);
  });

  it('clears the category when handed an empty list', async () => {
    await setFactoryOrder('c-rebar', ['نیشابور']);
    await setFactoryOrder('c-rebar', []);
    expect(await factoryOrderForCategory('rebar')).toEqual([]);
  });

  it('never touches another category', async () => {
    await setFactoryOrder('c-rebar', ['ذوب‌آهن اصفهان', 'نیشابور']);
    await setFactoryOrder('c-sheet', ['فولاد مبارکه']);
    // The same mill name exists in both; ordering it first in ورق must not
    // move it in میلگرد, and clearing ورق must not clear میلگرد.
    expect(await factoryOrderForCategory('rebar')).toEqual(['ذوب‌آهن اصفهان', 'نیشابور']);
    await setFactoryOrder('c-sheet', []);
    expect(await factoryOrderForCategory('rebar')).toEqual(['ذوب‌آهن اصفهان', 'نیشابور']);
  });

  it('drops blanks and repeats instead of failing on the unique index', async () => {
    const n = await setFactoryOrder('c-rebar', ['نیشابور', '  ', 'نیشابور', 'ابرکوه']);
    expect(n).toBe(2);
    expect(await factoryOrderForCategory('rebar')).toEqual(['نیشابور', 'ابرکوه']);
  });
});

describe('factoryOrderForCategory', () => {
  it('answers empty — not an error — for a category nobody has arranged', async () => {
    expect(await factoryOrderForCategory('rebar')).toEqual([]);
  });

  it('answers empty for a slug that does not exist', async () => {
    expect(await factoryOrderForCategory('no-such-category')).toEqual([]);
  });
});

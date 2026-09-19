// @vitest-environment node
/**
 * Migration 0070 fills the en/ar/zh names of ten stainless / thick-wall
 * sub-categories that the one-off backfill script never covered. It must be
 * additive (only NULL columns), idempotent (safe to re-run), and match on the
 * (category slug, sub slug) pair so a same-named slug under another category is
 * left alone.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { createTestDb } from '@/test/db';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';

const file = path.join(process.cwd(), 'drizzle', '0070_k_stainless_sub_locale_names.sql');
const statements = fs
  .readFileSync(file, 'utf8')
  .split('--> statement-breakpoint')
  .map((s) => s.trim())
  .filter(Boolean);

let db: Db;
let close: () => Promise<void>;

async function runMigration() {
  for (const stmt of statements) await db.execute(sql.raw(stmt));
}

async function sub(categoryId: string, slug: string) {
  const [row] = await db
    .select()
    .from(schema.subCategories)
    .where(and(eq(schema.subCategories.categoryId, categoryId), eq(schema.subCategories.slug, slug)));
  return row!;
}

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(schema.categories).values([
    { id: 'c-pipe', slug: 'pipe', name: 'لوله', order: 1, iconId: '' },
    { id: 'c-sheet', slug: 'sheet', name: 'ورق', order: 2, iconId: '' },
  ]);
  await db.insert(schema.subCategories).values([
    { id: 's1', categoryId: 'c-pipe', slug: 'lvlh-astyl-304', name: 'لوله استیل ۳۰۴', order: 1 },
    {
      id: 's2',
      categoryId: 'c-pipe',
      slug: 'lvlh-astyl-316l',
      name: 'لوله استیل ۳۱۶L',
      nameEn: 'Hand-edited name',
      order: 2,
    },
    // Same sub slug under a different category — the migration keys on the pair.
    { id: 's3', categoryId: 'c-sheet', slug: 'lvlh-astyl-304', name: 'لوله استیل ۳۰۴ (ورق)', order: 1 },
  ]);
});

afterAll(async () => {
  await close();
});

describe('0070 stainless sub-category locale names', () => {
  it('fills empty names for the matching (category, sub) pair', async () => {
    await runMigration();
    const row = await sub('c-pipe', 'lvlh-astyl-304');
    expect(row.nameEn).toBe('Stainless Steel Pipe 304');
    expect(row.nameAr).toBe('أنبوب ستانلس ستيل 304');
    expect(row.nameZh).toBe('304不锈钢管');
  });

  it('never overwrites a name that is already set, and fills the missing ones', async () => {
    const row = await sub('c-pipe', 'lvlh-astyl-316l');
    expect(row.nameEn).toBe('Hand-edited name');
    expect(row.nameAr).toBe('أنبوب ستانلس ستيل 316L');
    expect(row.nameZh).toBe('316L不锈钢管');
  });

  it('does not touch the fa name or the same slug under another category', async () => {
    expect((await sub('c-pipe', 'lvlh-astyl-304')).name).toBe('لوله استیل ۳۰۴');
    const other = await sub('c-sheet', 'lvlh-astyl-304');
    expect(other.nameEn).toBeNull();
  });

  it('is idempotent', async () => {
    const before = await sub('c-pipe', 'lvlh-astyl-304');
    await runMigration();
    expect(await sub('c-pipe', 'lvlh-astyl-304')).toEqual(before);
  });
});

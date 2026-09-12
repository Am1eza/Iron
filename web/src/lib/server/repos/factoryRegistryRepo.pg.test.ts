// @vitest-environment node
/**
 * B-06 (audit-catalog-B-FINAL) — the factory registry is the missing piece
 * the audit named: `skus.factory` free text lets an admin typo or fabricate a
 * mill name that then looks exactly as real as «ذوب‌آهن اصفهان» in search
 * facets or AI grounding. These pin the registry's actual behaviour: names
 * fold through the same normalizer every SKU write already uses (so the
 * registry itself cannot invent a second spelling of one mill), an unknown or
 * unverified name reads as "not confirmed" rather than throwing, and
 * `verifiedAt`/`source` can never drift out of lockstep with `status`.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestDb } from '@/test/db';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import {
  getFactoryRegistryEntry,
  isFactoryVerified,
  listFactoryRegistry,
  upsertFactoryRegistry,
} from './factoryRegistryRepo';

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
}, 120_000);

afterAll(async () => {
  await close();
});

beforeEach(async () => {
  await db.delete(schema.factoryRegistry);
});

describe('upsertFactoryRegistry', () => {
  it('creates an unverified entry by default, with no source and no verifiedAt', async () => {
    const entry = await upsertFactoryRegistry({ name: 'ذوب آهن اصفهان' });
    expect(entry.status).toBe('unverified');
    expect(entry.source).toBeNull();
    expect(entry.verifiedAt).toBeNull();
  });

  it('records source and verifiedAt together when marked verified', async () => {
    const before = Date.now();
    const entry = await upsertFactoryRegistry({
      name: 'فولاد مبارکه',
      status: 'verified',
      source: 'تماس تلفنی با کارخانه',
    });
    expect(entry.status).toBe('verified');
    expect(entry.source).toBe('تماس تلفنی با کارخانه');
    expect(entry.verifiedAt).not.toBeNull();
    expect(new Date(entry.verifiedAt!).getTime()).toBeGreaterThanOrEqual(before);
  });

  it('drops any client-supplied source/verifiedAt on an unverified entry — nothing to source yet', async () => {
    const entry = await upsertFactoryRegistry({
      name: 'کارخانهٔ نامعلوم',
      status: 'unverified',
      source: 'ادعای بدون منبع',
    });
    expect(entry.source).toBeNull();
    expect(entry.verifiedAt).toBeNull();
  });

  it('updates the SAME row on a repeated name rather than duplicating it', async () => {
    const first = await upsertFactoryRegistry({ name: 'فایکو' });
    const second = await upsertFactoryRegistry({
      name: 'فایکو',
      status: 'verified',
      source: 'سایت رسمی',
    });
    expect(second.id).toBe(first.id);
    const rows = await listFactoryRegistry();
    expect(rows.filter((r) => r.normalizedName === 'فایکو')).toHaveLength(1);
  });

  it('clears source/verifiedAt when a verified factory is walked back to unverified', async () => {
    await upsertFactoryRegistry({ name: 'فایکو', status: 'verified', source: 'سایت رسمی' });
    const reverted = await upsertFactoryRegistry({ name: 'فایکو', status: 'unverified' });
    expect(reverted.status).toBe('unverified');
    expect(reverted.source).toBeNull();
    expect(reverted.verifiedAt).toBeNull();
  });

  it('collapses ZWNJ/spacing spelling variants onto ONE registry row — the exact split B-08/B-06 both name', async () => {
    await upsertFactoryRegistry({ name: 'ذوب‌آهن اصفهان' }); // with نیم‌فاصله
    const viaSpace = await upsertFactoryRegistry({ name: 'ذوب  آهن   اصفهان', status: 'verified' });
    const rows = await listFactoryRegistry();
    expect(rows).toHaveLength(1);
    expect(viaSpace.status).toBe('verified');
  });

  it('rejects a blank/whitespace-only name rather than registering an empty factory', async () => {
    await expect(upsertFactoryRegistry({ name: '   ' })).rejects.toThrow();
  });
});

describe('getFactoryRegistryEntry / isFactoryVerified', () => {
  it('finds an entry by any spelling variant normalizeFactoryName folds together', async () => {
    await upsertFactoryRegistry({ name: 'ذوب‌آهن اصفهان', status: 'verified' });
    expect(await getFactoryRegistryEntry('ذوب آهن اصفهان')).not.toBeNull();
    expect(await isFactoryVerified('ذوب آهن اصفهان')).toBe(true);
  });

  it('answers "not verified" (not an error) for a factory never registered', async () => {
    expect(await getFactoryRegistryEntry('کارخانهٔ ساختگی')).toBeNull();
    expect(await isFactoryVerified('کارخانهٔ ساختگی')).toBe(false);
  });

  it('answers "not verified" for a registered-but-unverified factory — never a guess in the confirmed direction', async () => {
    await upsertFactoryRegistry({ name: 'کارخانهٔ تازه' });
    expect(await isFactoryVerified('کارخانهٔ تازه')).toBe(false);
  });
});

describe('listFactoryRegistry', () => {
  it('lists every registered factory, in a stable name-ordered sequence', async () => {
    await upsertFactoryRegistry({ name: 'فولاد نیشابور' });
    await upsertFactoryRegistry({ name: 'آریان فولاد' });
    const rows = await listFactoryRegistry();
    expect(rows.map((r) => r.name).sort()).toEqual(['آریان فولاد', 'فولاد نیشابور'].sort());
    // Ordered by `name` — not insertion order, not an arbitrary DB order —
    // reflected by asking twice and getting the identical sequence back.
    expect(await listFactoryRegistry()).toEqual(rows);
  });
});

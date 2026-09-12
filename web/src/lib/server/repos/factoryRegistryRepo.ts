/**
 * B-06 (audit-catalog-B-FINAL) — the factory REGISTRY repo.
 *
 * See `factoryRegistry` in `server/db/schema/catalog.ts` for what this table
 * is (and deliberately is not: it enforces nothing on its own, it is a
 * queryable "has this factory name actually been confirmed?" fact base for a
 * future gate — search facet, AI grounding context, admin warning badge —
 * to check against). This file is the whole read/write surface for it.
 */
import { asc, eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import { getDb } from '@/lib/server/db/client';
import { factoryRegistry, type FactoryRegistryStatus } from '@/lib/server/db/schema';
import { normalizeFactoryName } from '@/lib/server/utils/persianZwnj';

export type FactoryRegistryEntry = typeof factoryRegistry.$inferSelect;

/** Every registered factory, alphabetically — small, bounded table (on the
 *  order of the ~40-70 real mills this market has, per `catalogCompose`'s
 *  own `FACTORY_SLUG` map), so no pagination. */
export async function listFactoryRegistry(): Promise<FactoryRegistryEntry[]> {
  return getDb().select().from(factoryRegistry).orderBy(asc(factoryRegistry.name));
}

/** Look up one factory by name (any spelling variant `normalizeFactoryName`
 *  folds together). Null when nobody has ever recorded this factory. */
export async function getFactoryRegistryEntry(name: string): Promise<FactoryRegistryEntry | null> {
  const normalized = normalizeFactoryName(name);
  if (!normalized) return null;
  const rows = await getDb()
    .select()
    .from(factoryRegistry)
    .where(eq(factoryRegistry.normalizedName, normalized))
    .limit(1);
  return rows[0] ?? null;
}

/** The one boolean question B-06 exists to make answerable: is this factory
 *  name a confirmed real mill, as opposed to a typo or a fabricated one that
 *  happens to sit on a live SKU? An unregistered name reads as `false`, the
 *  same as an explicitly `'unverified'` row — "not yet confirmed" either way,
 *  never a guess in the confirmed direction. */
export async function isFactoryVerified(name: string): Promise<boolean> {
  const entry = await getFactoryRegistryEntry(name);
  return entry?.status === 'verified';
}

export interface UpsertFactoryRegistryInput {
  name: string;
  status?: FactoryRegistryStatus;
  /** Where the confirmation came from. Ignored (stored as-is otherwise) when
   *  `status` is `'unverified'` — there is nothing to source yet. */
  source?: string | null;
}

/**
 * Create-or-update one factory by name. Upsert, not insert-only: the same
 * factory typed again (the common case — an admin re-confirming, or a second
 * pass recording a source for a name added earlier) must update the one row
 * rather than collide on the unique index or silently no-op.
 *
 * `verifiedAt` is entirely repo-owned, never client-supplied: it is set to
 * now() the moment `status` becomes `'verified'` and cleared back to null the
 * moment it stops being `'verified'` — so the two columns can never disagree
 * regardless of what a caller passes for either.
 */
export async function upsertFactoryRegistry(
  input: UpsertFactoryRegistryInput,
): Promise<FactoryRegistryEntry> {
  const name = normalizeFactoryName(input.name);
  if (!name) throw new Error('نام کارخانه نمی‌تواند خالی باشد.');
  const status: FactoryRegistryStatus = input.status ?? 'unverified';
  const source = status === 'verified' ? (input.source ?? null) : null;
  const verifiedAt = status === 'verified' ? new Date() : null;

  const db = getDb();
  const existing = await getFactoryRegistryEntry(name);
  if (existing) {
    const rows = await db
      .update(factoryRegistry)
      .set({ name, status, source, verifiedAt, updatedAt: new Date() })
      .where(eq(factoryRegistry.id, existing.id))
      .returning();
    return rows[0]!;
  }
  const rows = await db
    .insert(factoryRegistry)
    .values({
      id: ulid(),
      name,
      normalizedName: name,
      status,
      source,
      verifiedAt,
    })
    .returning();
  return rows[0]!;
}

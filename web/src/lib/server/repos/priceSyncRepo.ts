/**
 * Reads and writes for the automated price mirror's audit trail (US-02.5).
 *
 * The mirror writes live prices with nobody watching, so this log is the whole
 * safety net: if the owner cannot see what the job did to which SKU, nobody
 * can ever notice a bad automated write. Keyset-paginated newest-first, the
 * same shape `auditRepo.listAudit` uses and for the same reason — an
 * append-only table has no cheap `count(*)` for page numbers.
 */
import { and, desc, eq, lt, or, sql, type SQL } from 'drizzle-orm';
import { ulid } from 'ulid';
import { getDb } from '@/lib/server/db/client';
import {
  categories,
  priceSyncEntries,
  priceSyncRuns,
  skus,
  subCategories,
} from '@/lib/server/db/schema';
import { writeAudit } from '@/lib/server/repos/auditRepo';

export type PriceSyncRunRow = typeof priceSyncRuns.$inferSelect;
export type PriceSyncEntryRow = typeof priceSyncEntries.$inferSelect;

export type NewSyncEntry = Omit<typeof priceSyncEntries.$inferInsert, 'id' | 'appliedAt'>;

/** A run that has been `running` longer than this is assumed dead (container
 *  restarted mid-fetch) and no longer blocks a new one. Comfortably longer
 *  than a full pass: 32 pages at 3.5s apart plus the writes is ~3 minutes. */
const RUN_LEASE = sql`interval '30 minutes'`;

/**
 * Claim the right to run. Returns null when another run is already in flight.
 *
 * A conditional INSERT rather than a pg advisory lock because the lock would
 * have to be SESSION-scoped (the job body does minutes of network I/O and must
 * not sit inside a transaction), and a session lock needs a connection pinned
 * for the whole run — which is exactly what `scheduler.ts` documents as the
 * thing to avoid against a pool shared with live request traffic. This is also
 * what stops the cron entry and an impatient admin's «اجرای دستی» from both
 * writing prices at the same moment.
 */
export async function createSyncRun(input: {
  source: 'ahanonline';
  trigger: 'cron' | 'manual';
}): Promise<string | null> {
  const id = ulid();
  // `INSERT … SELECT … WHERE NOT EXISTS` makes the claim atomic: two callers
  // racing here cannot both come back with a row, because the second one's
  // SELECT runs after the first one's insert is visible.
  const res = (await getDb().execute(sql`
    INSERT INTO price_sync_runs (id, source, trigger)
    SELECT ${id}, ${input.source}, ${input.trigger}
    WHERE NOT EXISTS (
      SELECT 1 FROM price_sync_runs
      WHERE status = 'running' AND started_at > now() - ${RUN_LEASE}
    )
    RETURNING id
  `)) as unknown as { rows?: Array<{ id: string }> } | Array<{ id: string }>;
  const rows = Array.isArray(res) ? res : (res.rows ?? []);
  return rows[0]?.id ?? null;
}

export async function finishSyncRun(
  id: string,
  patch: Partial<Pick<PriceSyncRunRow, 'status' | 'sourceRows' | 'consideredSkus' | 'written' | 'skipped' | 'error'>>,
): Promise<void> {
  await getDb()
    .update(priceSyncRuns)
    .set({ ...patch, finishedAt: new Date() })
    .where(eq(priceSyncRuns.id, id));
}

/** Chunked because a full run produces one row per active SKU (~400) and a
 *  single 400-row multi-values INSERT is well past the point where pg's
 *  bind-parameter budget stops being theoretical. */
const ENTRY_INSERT_CHUNK = 100;

export async function insertSyncEntries(entries: NewSyncEntry[]): Promise<number> {
  if (entries.length === 0) return 0;
  const db = getDb();
  for (let i = 0; i < entries.length; i += ENTRY_INSERT_CHUNK) {
    const chunk = entries.slice(i, i + ENTRY_INSERT_CHUNK).map((e) => ({ ...e, id: ulid() }));
    await db.insert(priceSyncEntries).values(chunk);
  }
  return entries.length;
}

export async function listSyncRuns(limit = 20): Promise<PriceSyncRunRow[]> {
  return getDb().select().from(priceSyncRuns).orderBy(desc(priceSyncRuns.startedAt)).limit(limit);
}

export interface SyncEntryQuery {
  runId?: string;
  outcome?: 'written' | 'skipped';
  categorySlug?: string;
  /** Keyset cursor — `${appliedAtIso}|${id}` from a previous page. */
  cursor?: string;
  limit?: number;
}

export interface SyncEntryListRow {
  id: string;
  runId: string;
  skuId: string;
  skuName: string;
  skuSlug: string;
  categoryName: string;
  categorySlug: string;
  subCategoryName: string;
  factory: string | null;
  outcome: 'written' | 'skipped';
  reason: string;
  oldPrice: number | null;
  newPrice: number | null;
  source: string;
  matchedName: string | null;
  matchedFactory: string | null;
  matchedCode: string | null;
  matchedUnit: string | null;
  sourceUpdatedAt: string | null;
  confidence: string;
  appliedAt: Date;
  /** Live flag, not a snapshot — the toggle in the UI reads back from here. */
  excluded: boolean;
}

const MAX_PAGE = 100;

function decodeCursor(cursor: string | undefined): { at: Date; id: string } | null {
  if (!cursor) return null;
  const idx = cursor.lastIndexOf('|');
  if (idx <= 0) return null;
  const at = new Date(cursor.slice(0, idx));
  const id = cursor.slice(idx + 1);
  if (Number.isNaN(at.getTime()) || !id) return null;
  return { at, id };
}

export async function listSyncEntries(
  query: SyncEntryQuery = {},
): Promise<{ entries: SyncEntryListRow[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(query.limit ?? 50, 1), MAX_PAGE);
  const conds: SQL[] = [];
  if (query.runId) conds.push(eq(priceSyncEntries.runId, query.runId));
  if (query.outcome) conds.push(eq(priceSyncEntries.outcome, query.outcome));
  if (query.categorySlug) conds.push(eq(categories.slug, query.categorySlug));
  const cursor = decodeCursor(query.cursor);
  if (cursor) {
    conds.push(
      or(
        lt(priceSyncEntries.appliedAt, cursor.at),
        and(eq(priceSyncEntries.appliedAt, cursor.at), lt(priceSyncEntries.id, cursor.id)),
      )!,
    );
  }

  const rows = await getDb()
    .select({
      id: priceSyncEntries.id,
      runId: priceSyncEntries.runId,
      skuId: priceSyncEntries.skuId,
      skuName: skus.name,
      skuSlug: skus.slug,
      factory: skus.factory,
      excluded: skus.priceSyncExcluded,
      categoryName: categories.name,
      categorySlug: categories.slug,
      subCategoryName: subCategories.name,
      outcome: priceSyncEntries.outcome,
      reason: priceSyncEntries.reason,
      oldPrice: priceSyncEntries.oldPrice,
      newPrice: priceSyncEntries.newPrice,
      source: priceSyncEntries.source,
      matchedName: priceSyncEntries.matchedName,
      matchedFactory: priceSyncEntries.matchedFactory,
      matchedCode: priceSyncEntries.matchedCode,
      matchedUnit: priceSyncEntries.matchedUnit,
      sourceUpdatedAt: priceSyncEntries.sourceUpdatedAt,
      confidence: priceSyncEntries.confidence,
      appliedAt: priceSyncEntries.appliedAt,
    })
    .from(priceSyncEntries)
    .innerJoin(skus, eq(skus.id, priceSyncEntries.skuId))
    .innerJoin(categories, eq(categories.id, skus.categoryId))
    .innerJoin(subCategories, eq(subCategories.id, skus.subCategoryId))
    .where(conds.length > 0 ? and(...conds) : undefined)
    .orderBy(desc(priceSyncEntries.appliedAt), desc(priceSyncEntries.id))
    .limit(limit + 1);

  const page = rows.slice(0, limit) as SyncEntryListRow[];
  const nextCursor =
    rows.length > limit && page.length > 0
      ? `${page[page.length - 1]!.appliedAt.toISOString()}|${page[page.length - 1]!.id}`
      : null;
  return { entries: page, nextCursor };
}

/** Roll-up for one run, so the admin header can say «۳۱ نوشته، ۲۰۴ رد شده»
 *  without paging through every entry. */
export async function syncRunBreakdown(runId: string): Promise<Array<{ reason: string; count: number }>> {
  const rows = await getDb()
    .select({ reason: priceSyncEntries.reason, count: sql<number>`count(*)::int` })
    .from(priceSyncEntries)
    .where(eq(priceSyncEntries.runId, runId))
    .groupBy(priceSyncEntries.reason)
    .orderBy(desc(sql`count(*)`));
  return rows;
}

// ---------------------------------------------------------------------------
// The manual-override flag
// ---------------------------------------------------------------------------

export interface ExcludedSkuRow {
  id: string;
  name: string;
  slug: string;
  factory: string | null;
  categoryName: string;
  subCategoryName: string;
}

export async function listExcludedSkus(): Promise<ExcludedSkuRow[]> {
  return getDb()
    .select({
      id: skus.id,
      name: skus.name,
      slug: skus.slug,
      factory: skus.factory,
      categoryName: categories.name,
      subCategoryName: subCategories.name,
    })
    .from(skus)
    .innerJoin(categories, eq(categories.id, skus.categoryId))
    .innerJoin(subCategories, eq(subCategories.id, skus.subCategoryId))
    .where(eq(skus.priceSyncExcluded, true))
    .orderBy(categories.name, skus.name);
}

/**
 * Flip one SKU's manual-override flag. Audited through the normal
 * `audit_entries` trail (entityType `sku`) rather than the sync log — this is
 * a human's decision about a SKU, not something a run did.
 *
 * Returns false when the SKU does not exist, so the route can 404 rather than
 * silently reporting success on a typo'd id.
 */
export async function setPriceSyncExcluded(
  actorId: string | null,
  skuId: string,
  excluded: boolean,
): Promise<boolean> {
  const db = getDb();
  const before = await db
    .select({ excluded: skus.priceSyncExcluded })
    .from(skus)
    .where(eq(skus.id, skuId))
    .limit(1);
  if (before.length === 0) return false;
  if (before[0]!.excluded === excluded) return true; // no-op, nothing to audit

  await db.update(skus).set({ priceSyncExcluded: excluded, updatedAt: new Date() }).where(eq(skus.id, skuId));
  await writeAudit({
    actorId,
    action: 'sku.priceSyncExcluded',
    entityType: 'sku',
    entityId: skuId,
    before: { priceSyncExcluded: before[0]!.excluded },
    after: { priceSyncExcluded: excluded },
  });
  return true;
}

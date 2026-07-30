/** Price alerts (قیمت‌سنج) — per-user CRUD + the evaluation query. */
import { and, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import { getDb, type DbOrTx } from '@/lib/server/db/client';
import { alerts, skus, currentPrices, marketValues } from '@/lib/server/db/schema';
import { getSetting } from './settingsRepo';
import type { MarketKey, NotifyChannel } from '@/lib/types/domain';

export type AlertRow = typeof alerts.$inferSelect;

export interface AlertDto {
  id: string;
  target: { type: 'sku'; skuId: string; label?: string } | { type: 'market'; key: MarketKey; label?: string };
  op: 'below' | 'above';
  threshold: number;
  channel: NotifyChannel;
  status: 'active' | 'triggered' | 'paused';
  lastTriggeredAt?: string;
  createdAt: string;
  updatedAt: string;
  /** Live current SKU price / market value + staleness (W22) — populated
   *  only by `alertsForUser` (the customer's own list needs it for a
   *  "how close is this to firing" indicator); omitted elsewhere. */
  currentValue?: number | null;
  isStale?: boolean;
}

export function toAlertDto(r: AlertRow, label?: string): AlertDto {
  return {
    id: r.id,
    target:
      r.targetType === 'sku'
        ? { type: 'sku', skuId: r.skuId ?? '', label }
        : { type: 'market', key: (r.marketKey ?? 'usd') as MarketKey, label },
    op: r.op,
    threshold: r.threshold,
    channel: r.channel,
    status: r.status,
    lastTriggeredAt: r.lastTriggeredAt?.toISOString(),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export async function activeAlertCount(userId: string): Promise<number> {
  const rows = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(alerts)
    .where(and(eq(alerts.userId, userId), eq(alerts.status, 'active'), isNull(alerts.deletedAt)));
  return rows[0]?.n ?? 0;
}

/** Count of alerts sitting in 'triggered' across ALL users — feeds the
 *  /admin/stats `triggeredAlerts` field (W22), which drives both the alerts
 *  page's summary tile and the admin nav badge. A 'triggered' alert has
 *  fired but nobody has paused it or re-armed it yet, i.e. it's an unread
 *  work queue, the same shape as `pendingVerifications` above. */
export async function triggeredAlertCount(): Promise<number> {
  const rows = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(alerts)
    .where(and(eq(alerts.status, 'triggered'), isNull(alerts.deletedAt)));
  return rows[0]?.n ?? 0;
}

/**
 * Per-tier active-alert cap (W22 — owner's explicit call): a base/iron user
 * gets 2, a steel or poolad club member gets more. Deliberately keeps
 * `base` and `iron` equal — the public club-perk copy (`src/lib/data/club.ts`)
 * already promises the dedicated price-alert perk starting at STEEL, not at
 * the zero-effort iron tier everyone gets on joining; matching that promise
 * exactly avoids handing out a "join the club" freebie the copy never
 * offered. Stored as one JSON setting so an admin can retune all four
 * without a deploy — see PricingRulesCard in SettingsForm.tsx.
 */
export const DEFAULT_ALERT_TIER_CAPS = { base: 2, iron: 2, steel: 6, poolad: 10 } as const;
export type AlertTierCaps = { base: number; iron: number; steel: number; poolad: number };

export async function alertCapForTier(tier: 'iron' | 'steel' | 'poolad' | undefined): Promise<number> {
  const caps = await getSetting<AlertTierCaps>('ALERT_TIER_CAPS', DEFAULT_ALERT_TIER_CAPS);
  const key = tier ?? 'base';
  return caps[key] ?? DEFAULT_ALERT_TIER_CAPS.base;
}

export class AlertTargetNotFoundError extends Error {}
export class AlertCapExceededError extends Error {
  constructor(public cap: number) {
    super(`حداکثر ${cap} هشدار فعال می‌توانید داشته باشید.`);
  }
}

/** Serializes EVERY cap-relevant mutation for one user — create, and
 *  reactivate-from-paused/triggered, from BOTH the customer and admin route
 *  — behind a single per-user advisory lock. Review finding (W22): the cap
 *  was originally checked with a plain read-then-write, so N concurrent
 *  requests for DIFFERENT targets (each individually valid) could all read
 *  the same pre-write count and all commit, exceeding the cap — the old
 *  per-dedup-key lock in createAlert only ever serialized identical-target
 *  requests against each other, never different ones. A lock scoped to the
 *  whole user is broader and subsumes that narrower one, so the per-target
 *  lock was removed rather than kept alongside this. */
async function withUserAlertLock<T>(userId: string, fn: (tx: DbOrTx) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`alert-user-lock:${userId}`}))`);
    return fn(tx);
  });
}

async function activeAlertCountTx(tx: DbOrTx, userId: string): Promise<number> {
  const rows = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(alerts)
    .where(and(eq(alerts.userId, userId), eq(alerts.status, 'active'), isNull(alerts.deletedAt)));
  return rows[0]?.n ?? 0;
}

/**
 * Create an alert, merging into an existing identical ACTIVE alert instead
 * of duplicating it (VR-C1 — a double-submit must not fire two SMS for one
 * crossing), and enforcing `cap` atomically against every other cap-relevant
 * mutation for this user (see `withUserAlertLock`). Throws
 * `AlertCapExceededError` if the user is already at their cap and this
 * would be a genuinely NEW alert (a merge into an existing one never
 * consumes a slot, so it's checked after the merge lookup, not before).
 *
 * Validates a `sku` target actually exists first (W22) — mirrors
 * `favoritesRepo.addFavorite`'s existence check instead of letting a bogus
 * skuId hit the DB and throw a raw FK-violation 500.
 */
export async function createAlert(input: {
  userId: string;
  target: { type: 'sku'; skuId: string } | { type: 'market'; key: MarketKey };
  op: 'below' | 'above';
  threshold: number;
  channel: NotifyChannel;
  cap: number;
}): Promise<{ alert: AlertDto; merged: boolean }> {
  if (input.target.type === 'sku') {
    const found = await getDb().select({ id: skus.id }).from(skus).where(eq(skus.id, input.target.skuId)).limit(1);
    if (!found[0]) throw new AlertTargetNotFoundError('این محصول یافت نشد.');
  }
  return withUserAlertLock(input.userId, async (tx) => {
    const matchCond = and(
      eq(alerts.userId, input.userId),
      eq(alerts.status, 'active'),
      isNull(alerts.deletedAt),
      eq(alerts.targetType, input.target.type),
      input.target.type === 'sku' ? eq(alerts.skuId, input.target.skuId) : eq(alerts.marketKey, input.target.key),
      eq(alerts.op, input.op),
      eq(alerts.threshold, input.threshold),
    );
    const existing = await tx.select().from(alerts).where(matchCond).limit(1);
    if (existing[0]) {
      return { alert: toAlertDto(existing[0]), merged: true };
    }

    const activeCount = await activeAlertCountTx(tx, input.userId);
    if (activeCount >= input.cap) throw new AlertCapExceededError(input.cap);

    const rows = await tx
      .insert(alerts)
      .values({
        id: ulid(),
        userId: input.userId,
        targetType: input.target.type,
        skuId: input.target.type === 'sku' ? input.target.skuId : null,
        marketKey: input.target.type === 'market' ? input.target.key : null,
        op: input.op,
        threshold: input.threshold,
        channel: input.channel,
      })
      .returning();
    return { alert: toAlertDto(rows[0]!), merged: false };
  });
}

/** Re-arms a paused/triggered alert back to 'active', enforcing `cap`
 *  atomically under the same per-user lock `createAlert` uses (W22 review
 *  fix — this closes the reactivation half of the same TOCTOU race). Used
 *  by BOTH the customer PATCH route and the admin PATCH route (with the
 *  alert OWNER's id, not the acting admin's, as the lock/count subject).
 *  Pausing doesn't go through this — only the active-going transition is
 *  cap-relevant. Returns null if the alert doesn't exist (soft-deleted or
 *  bad id); throws `AlertCapExceededError` if reactivating would exceed cap. */
export async function reactivateAlert(id: string, ownerUserId: string, cap: number): Promise<AlertRow | null> {
  return withUserAlertLock(ownerUserId, async (tx) => {
    const rows = await tx
      .select()
      .from(alerts)
      .where(and(eq(alerts.id, id), isNull(alerts.deletedAt)))
      .limit(1);
    const current = rows[0];
    if (!current) return null;
    if (current.status !== 'active') {
      const activeCount = await activeAlertCountTx(tx, ownerUserId);
      if (activeCount >= cap) throw new AlertCapExceededError(cap);
    }
    const updated = await tx
      .update(alerts)
      .set({ status: 'active', updatedAt: new Date() })
      .where(eq(alerts.id, id))
      .returning();
    return updated[0] ?? null;
  });
}

export interface AdminAlertDto extends AlertDto {
  mobile: string;
  name: string | null;
  /** Current SKU price / market value the alert compares against — null
   *  when the underlying feed has never priced it. Lets ops see "how close
   *  is this to firing" instead of just the threshold in isolation (W22). */
  currentValue: number | null;
  /** True when the underlying price/market value is flagged stale — the
   *  evaluation job now skips these (see alerts.service.ts), so an admin
   *  needs to see WHY an alert near its threshold still hasn't fired. */
  isStale: boolean;
}

/** All alerts across every user (admin management page), newest first,
 *  optionally filtered by status and/or a free-text search across customer
 *  name/mobile and the target's display label (W22 — search didn't exist at
 *  all before this). Returns a real `total` (not just `hasMore`) so the
 *  page can use the shared `PagerFooter`, matching orders/warehouse. */
export async function adminListAlerts(query: {
  status?: AlertRow['status'];
  q?: string;
  page?: number;
  perPage?: number;
}): Promise<{ rows: AdminAlertDto[]; total: number }> {
  const { users } = await import('@/lib/server/db/schema');
  const size = Math.min(Math.max(query.perPage ?? 50, 1), 100);
  const page = Math.max(query.page ?? 1, 1);

  const conds = [isNull(alerts.deletedAt)];
  if (query.status) conds.push(eq(alerts.status, query.status));
  if (query.q?.trim()) {
    const like = `%${query.q.trim()}%`;
    conds.push(or(ilike(users.mobile, like), ilike(users.name, like), ilike(skus.name, like), ilike(marketValues.label, like))!);
  }
  const where = and(...conds);
  // Both queries join the same tables `where` filters against (users always;
  // skus/marketValues only when `q` is set, since `ilike` on their columns
  // needs the join present) — the count query still needs the sku/market
  // joins whenever `q` is set, or a search hit on a SKU/market label name
  // would silently undercount.
  const needsTargetJoins = Boolean(query.q?.trim());

  const [rows, totalRows] = await Promise.all([
    getDb()
      .select({
        alert: alerts,
        mobile: users.mobile,
        name: users.name,
        skuName: skus.name,
        skuPrice: currentPrices.price,
        skuStale: currentPrices.isStale,
        marketLabel: marketValues.label,
        marketValue: marketValues.value,
        marketStale: marketValues.isStale,
      })
      .from(alerts)
      .innerJoin(users, eq(alerts.userId, users.id))
      .leftJoin(skus, eq(alerts.skuId, skus.id))
      .leftJoin(currentPrices, eq(alerts.skuId, currentPrices.skuId))
      .leftJoin(marketValues, eq(alerts.marketKey, marketValues.key))
      .where(where)
      .orderBy(desc(alerts.createdAt))
      .limit(size)
      .offset((page - 1) * size),
    needsTargetJoins
      ? getDb()
          .select({ n: sql<number>`count(*)::int` })
          .from(alerts)
          .innerJoin(users, eq(alerts.userId, users.id))
          .leftJoin(skus, eq(alerts.skuId, skus.id))
          .leftJoin(marketValues, eq(alerts.marketKey, marketValues.key))
          .where(where)
      : getDb()
          .select({ n: sql<number>`count(*)::int` })
          .from(alerts)
          .innerJoin(users, eq(alerts.userId, users.id))
          .where(where),
  ]);
  const total = totalRows[0]?.n ?? 0;

  return {
    rows: rows.map((r) => ({
      ...toAlertDto(r.alert, r.skuName ?? r.marketLabel ?? undefined),
      mobile: r.mobile,
      name: r.name,
      currentValue: r.alert.targetType === 'sku' ? (r.skuPrice ?? null) : (r.marketValue ?? null),
      isStale: r.alert.targetType === 'sku' ? (r.skuStale ?? false) : (r.marketStale ?? false),
    })),
    total,
  };
}

/** User's alerts with display labels (SKU name / market label). */
/** User's alerts with display labels AND the live current value (W22) — a
 *  customer needs to see how close their own alert is to firing, the same
 *  "why hasn't this fired" transparency the admin list already has. */
export async function alertsForUser(userId: string): Promise<AlertDto[]> {
  const rows = await getDb()
    .select({
      alert: alerts,
      skuName: skus.name,
      skuPrice: currentPrices.price,
      skuStale: currentPrices.isStale,
      marketLabel: marketValues.label,
      marketValue: marketValues.value,
      marketStale: marketValues.isStale,
    })
    .from(alerts)
    .leftJoin(skus, eq(alerts.skuId, skus.id))
    .leftJoin(currentPrices, eq(alerts.skuId, currentPrices.skuId))
    .leftJoin(marketValues, eq(alerts.marketKey, marketValues.key))
    .where(and(eq(alerts.userId, userId), isNull(alerts.deletedAt)))
    .orderBy(desc(alerts.createdAt));
  return rows.map((r) => ({
    ...toAlertDto(r.alert, r.skuName ?? r.marketLabel ?? undefined),
    currentValue: r.alert.targetType === 'sku' ? (r.skuPrice ?? null) : (r.marketValue ?? null),
    isStale: r.alert.targetType === 'sku' ? (r.skuStale ?? false) : (r.marketStale ?? false),
  }));
}

export async function findAlert(id: string): Promise<AlertRow | null> {
  const rows = await getDb()
    .select()
    .from(alerts)
    .where(and(eq(alerts.id, id), isNull(alerts.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateAlertStatus(id: string, status: AlertRow['status'], lastTriggeredAt?: Date) {
  const rows = await getDb()
    .update(alerts)
    .set({ status, updatedAt: new Date(), ...(lastTriggeredAt ? { lastTriggeredAt } : {}) })
    .where(and(eq(alerts.id, id), isNull(alerts.deletedAt)))
    .returning();
  return rows[0] ?? null;
}

/**
 * Atomically claim an alert for firing — compare-and-swap on `status='active'`.
 * Returns the updated row only if THIS call won the race (still active at
 * the moment of the UPDATE), null if another concurrent evaluator already
 * claimed it. Callers MUST claim before sending the notification (not after)
 * — `evaluateAlerts` can run from both the 60s job and an inline call after
 * an admin price save, and Postgres's row-level UPDATE lock is what actually
 * serializes the two, not any lock taken in application code.
 */
export async function claimAlertForTrigger(id: string): Promise<AlertRow | null> {
  const rows = await getDb()
    .update(alerts)
    .set({ status: 'triggered', lastTriggeredAt: new Date(), updatedAt: new Date() })
    .where(and(eq(alerts.id, id), eq(alerts.status, 'active')))
    .returning();
  return rows[0] ?? null;
}

/** Un-claims an alert after a TRANSIENT notification failure (W22) — the
 *  claim-then-notify ordering means a failed SMS send would otherwise leave
 *  the alert permanently 'triggered' with the customer never actually
 *  told. CAS back to 'active' only if still 'triggered' (safety against a
 *  customer having manually re-armed it in the meantime), and clears
 *  `lastTriggeredAt` since it never really fired. */
export async function revertAlertClaim(id: string): Promise<void> {
  await getDb()
    .update(alerts)
    .set({ status: 'active', lastTriggeredAt: null, updatedAt: new Date() })
    .where(and(eq(alerts.id, id), eq(alerts.status, 'triggered')));
}

/** Soft-delete (W22, matches leads/orders/warehouseItems) — a hard DELETE
 *  erased a cap-relevant history with no audit trail. */
export async function deleteAlert(id: string): Promise<void> {
  await getDb().update(alerts).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(alerts.id, id));
}

/** Active alerts joined with their current values + owner mobile — the
 *  job's input. Also carries `isStale` (W22 — evaluateAlerts now skips a
 *  stale feed instead of firing on it) and the SKU's route fields so the
 *  notification can link straight to the product page. */
export async function activeAlertsWithValues() {
  const db = getDb();
  const { users } = await import('@/lib/server/db/schema');
  return db
    .select({
      alert: alerts,
      mobile: users.mobile,
      name: users.name,
      skuName: skus.name,
      skuSlug: skus.slug,
      skuCategoryId: skus.categoryId,
      skuSubCategoryId: skus.subCategoryId,
      skuPrice: currentPrices.price,
      // W23 review fix: `isStale` here is a fallback for callers with no
      // live freshness check handy — `evaluateAlerts()` itself now uses
      // `skuUpdatedAt`/`marketUpdatedAt` with the SAME live
      // `getPriceFreshness()` every other price-reading path uses, instead
      // of this persisted column (only refreshed every 10 minutes by the
      // staleness job, vs. this evaluator running every 60 seconds — up to
      // ~10 minutes where this column still says "fresh" after the live
      // check would already say stale). `marketStale` is the ONE exception —
      // see its comment below; the evaluator still reads it directly.
      skuStale: currentPrices.isStale,
      skuUpdatedAt: currentPrices.updatedAt,
      marketLabel: marketValues.label,
      marketValue: marketValues.value,
      // Review fix: `flagTgjuStale()` (marketRepo.ts) marks a market row
      // unreliable during a TGJU outage WITHOUT touching `updatedAt` — the
      // last-good value keeps serving with its original timestamp. A
      // same-Jalali-day live check alone can't see that flag (the feed can
      // die hours after a fresh morning poll, same day), so the evaluator
      // ORs this persisted flag in for market-type alerts instead of relying
      // on live freshness alone.
      marketStale: marketValues.isStale,
      marketUpdatedAt: marketValues.updatedAt,
    })
    .from(alerts)
    .innerJoin(users, eq(alerts.userId, users.id))
    .leftJoin(skus, eq(alerts.skuId, skus.id))
    .leftJoin(currentPrices, eq(alerts.skuId, currentPrices.skuId))
    .leftJoin(marketValues, eq(alerts.marketKey, marketValues.key))
    .where(and(eq(alerts.status, 'active'), isNull(alerts.deletedAt)));
}

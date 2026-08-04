// @vitest-environment node
/**
 * Regression guard for the KPI-source hardening (W29, audit area 9/21).
 *
 * `dailySeries`/`windowCount` used to take `(table, dateCol, extraWhere)` as
 * three free-form strings interpolated through `sql.raw`. Replacing them with
 * a closed `KpiSource` union moved the soft-delete predicate from a
 * caller-supplied SQL string (`'AND t.deleted_at IS NULL'`) into a lookup
 * table — and a silently-dropped soft-delete filter is the exact failure that
 * refactor could cause: every leads/orders KPI on the overview and management
 * dashboards would start counting archived rows, inflating the numbers the
 * owner steers on with nothing anywhere reporting an error.
 *
 * There was no coverage of `overviewStats`/`dashboardStats` at all before this.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ulid } from 'ulid';
import { createTestDb } from '@/test/db';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import { overviewStats, dashboardStats } from './analyticsRepo';

let db: Db;
let close: () => Promise<void>;

/** Inside the last 7 FULL days and never "today" (which the KPIs exclude
 *  from current-vs-prior comparisons on purpose). */
const DAYS_AGO_3 = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

async function makeLead(deleted: boolean) {
  const id = ulid();
  await db.insert(schema.leads).values({
    id,
    ref: `L-${id.slice(-8)}`,
    contactMobile: '09120000001',
    source: 'table',
    status: 'new',
    channelPref: 'sms',
    createdAt: DAYS_AGO_3,
    updatedAt: DAYS_AGO_3,
    deletedAt: deleted ? DAYS_AGO_3 : null,
  });
  return id;
}

async function makeOrder(leadId: string, deleted: boolean) {
  const id = ulid();
  await db.insert(schema.orders).values({
    id,
    ref: `O-${id.slice(-8)}`,
    leadId,
    status: 'registered',
    placedAt: DAYS_AGO_3,
    deletedAt: deleted ? DAYS_AGO_3 : null,
  });
}

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  // 2 live + 1 archived of each, all inside the current window.
  const a = await makeLead(false);
  const b = await makeLead(false);
  const gone = await makeLead(true);
  await makeOrder(a, false);
  await makeOrder(b, false);
  await makeOrder(gone, true);
  // users has no deleted_at — proves the non-soft-delete branch still emits
  // valid SQL (an unconditional `AND t.deleted_at IS NULL` would error here).
  await db.insert(schema.users).values({
    id: ulid(),
    mobile: '09120000009',
    role: 'customer',
    createdAt: DAYS_AGO_3,
  });
}, 120_000);

afterAll(async () => {
  await close();
});

describe('KPI sources — soft-deleted rows stay excluded after the sql.raw hardening', () => {
  it('overviewStats counts live leads/orders only', async () => {
    const s = await overviewStats();
    expect(s.leads.current).toBe(2); // 3 rows exist; one is archived
    expect(s.orders.current).toBe(2);
    // The 30-day sparkline goes through dailySeries (the other sql.raw call
    // site) — same predicate, separately rendered.
    expect(s.leads.series.reduce((x, y) => x + y, 0)).toBe(2);
    expect(s.orders.series.reduce((x, y) => x + y, 0)).toBe(2);
  });

  it('sources WITHOUT a deleted_at column still produce valid SQL', async () => {
    const s = await overviewStats();
    expect(s.newUsers.current).toBe(1);
    expect(s.aiConversations.current).toBe(0);
    expect(s.proformas.current).toBe(0);
  });

  it('dashboardStats applies the same exclusion', async () => {
    const s = await dashboardStats(7);
    expect(s.leads.current).toBe(2);
    expect(s.orders.current).toBe(2);
  });
});

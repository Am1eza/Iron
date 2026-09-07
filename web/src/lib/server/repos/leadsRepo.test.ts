// @vitest-environment node
/**
 * adminListLeads — from/to date-range filter (US-19.3). Assignee/status/q
 * filters are already exercised indirectly elsewhere (leads.test.ts,
 * LeadDetail's assignee select); this covers the new range filter in
 * isolation with directly-controlled createdAt values.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import { createTestDb } from '@/test/db';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import { adminListLeads, updateLead, updateLeadItem } from './leadsRepo';

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
}, 120_000);
afterAll(async () => {
  await close();
});

async function insertLeadAt(ref: string, createdAt: Date) {
  await db.insert(schema.leads).values({
    id: ulid(),
    ref,
    contactMobile: '09120000001',
    source: 'table',
    createdAt,
    updatedAt: createdAt,
  });
}

describe('adminListLeads — from/to date range', () => {
  it('excludes rows outside the range and includes rows on the boundary (inclusive)', async () => {
    const prefix = `RANGE-${ulid()}`;
    const before = new Date('2026-01-01T00:00:00.000Z');
    const boundary = new Date('2026-01-05T00:00:00.000Z');
    const after = new Date('2026-01-10T00:00:00.000Z');
    await insertLeadAt(`${prefix}-before`, before);
    await insertLeadAt(`${prefix}-boundary`, boundary);
    await insertLeadAt(`${prefix}-after`, after);

    const { leads } = await adminListLeads({ q: prefix, from: boundary, to: boundary, perPage: 10 });
    expect(leads.map((l) => l.ref)).toEqual([`${prefix}-boundary`]);

    const { leads: fromOnly } = await adminListLeads({ q: prefix, from: boundary, perPage: 10 });
    expect(fromOnly.map((l) => l.ref).sort()).toEqual([`${prefix}-after`, `${prefix}-boundary`].sort());

    const { leads: toOnly } = await adminListLeads({ q: prefix, to: boundary, perPage: 10 });
    expect(toOnly.map((l) => l.ref).sort()).toEqual([`${prefix}-before`, `${prefix}-boundary`].sort());
  });
});

describe('adminListLeads — urgency sort', () => {
  async function insertLeadRow(ref: string, patch: Partial<typeof schema.leads.$inferInsert>) {
    await db.insert(schema.leads).values({
      id: ulid(),
      ref,
      contactMobile: '09120000002',
      source: 'table',
      ...patch,
    });
  }

  it('orders never-contacted first, then overdue/stale/upcoming, closed last', async () => {
    const prefix = `URG-${ulid()}`;
    const now = new Date();
    const hour = 3_600_000;
    // Deliberately inserted OUT of the expected order, so a passing test
    // proves the ORDER BY, not insertion order.
    await insertLeadRow(`${prefix}-closed`, { status: 'won' });
    await insertLeadRow(`${prefix}-upcoming`, { status: 'contacted', callbackAt: new Date(now.getTime() + hour) });
    await insertLeadRow(`${prefix}-new`, { status: 'new' });
    await insertLeadRow(`${prefix}-stale`, { status: 'contacted', callbackAt: null });
    await insertLeadRow(`${prefix}-overdue`, { status: 'contacted', callbackAt: new Date(now.getTime() - hour) });

    const { leads } = await adminListLeads({ q: prefix, sort: 'urgency', perPage: 10 });
    expect(leads.map((l) => l.ref)).toEqual([
      `${prefix}-new`,
      `${prefix}-overdue`,
      `${prefix}-stale`,
      `${prefix}-upcoming`,
      `${prefix}-closed`,
    ]);
  });

  it('within the never-contacted tier, the longest-ignored lead comes first', async () => {
    const prefix = `URG2-${ulid()}`;
    const day = 86_400_000;
    const now = Date.now();
    await insertLeadRow(`${prefix}-recent`, { status: 'new', createdAt: new Date(now - day) });
    await insertLeadRow(`${prefix}-oldest`, { status: 'new', createdAt: new Date(now - 3 * day) });
    await insertLeadRow(`${prefix}-middle`, { status: 'new', createdAt: new Date(now - 2 * day) });

    const { leads } = await adminListLeads({ q: prefix, sort: 'urgency', perPage: 10 });
    expect(leads.map((l) => l.ref)).toEqual([`${prefix}-oldest`, `${prefix}-middle`, `${prefix}-recent`]);
  });

  it('within the overdue tier, the most-overdue callback comes first', async () => {
    const prefix = `URG3-${ulid()}`;
    const hour = 3_600_000;
    const now = Date.now();
    await insertLeadRow(`${prefix}-just-missed`, { status: 'contacted', callbackAt: new Date(now - hour) });
    await insertLeadRow(`${prefix}-missed-yesterday`, { status: 'contacted', callbackAt: new Date(now - 26 * hour) });

    const { leads } = await adminListLeads({ q: prefix, sort: 'urgency', perPage: 10 });
    expect(leads.map((l) => l.ref)).toEqual([`${prefix}-missed-yesterday`, `${prefix}-just-missed`]);
  });

  it('defaults to newest-first when sort is omitted — the export/legacy callers are unaffected', async () => {
    const prefix = `URG4-${ulid()}`;
    const day = 86_400_000;
    const now = Date.now();
    // Oldest lead is 'new' (tier 0) — under urgency sort it would come FIRST;
    // under the default it must stay LAST, proving no accidental urgency
    // bleed-through when the caller doesn't ask for it.
    await insertLeadRow(`${prefix}-old-new`, { status: 'new', createdAt: new Date(now - 5 * day) });
    await insertLeadRow(`${prefix}-recent-won`, { status: 'won', createdAt: new Date(now - day) });

    const { leads } = await adminListLeads({ q: prefix, perPage: 10 });
    expect(leads.map((l) => l.ref)).toEqual([`${prefix}-recent-won`, `${prefix}-old-new`]);
  });
});

describe('updateLeadItem (US-19.4)', () => {
  async function insertLeadWithItem() {
    const leadId = ulid();
    const itemId = ulid();
    await db.insert(schema.leads).values({ id: leadId, ref: `ITEM-${leadId}`, contactMobile: '09120000005', source: 'table' });
    await db.insert(schema.leadItems).values({
      id: itemId,
      leadId,
      name: 'میلگرد ۱۴',
      qty: 2,
      unit: 'kg',
      unitPrice: 50_000,
      lineTotal: 100_000,
    });
    return { leadId, itemId };
  }

  it('recomputes lineTotal from the resulting qty×unitPrice, not the raw patch', async () => {
    const { leadId, itemId } = await insertLeadWithItem();
    const updated = await updateLeadItem(itemId, leadId, { qty: 5 });
    expect(updated).toMatchObject({ qty: 5, unitPrice: 50_000, lineTotal: 250_000 });
  });

  it('keeps the current qty when only unitPrice is patched', async () => {
    const { leadId, itemId } = await insertLeadWithItem();
    const updated = await updateLeadItem(itemId, leadId, { unitPrice: 60_000 });
    expect(updated).toMatchObject({ qty: 2, unitPrice: 60_000, lineTotal: 120_000 });
  });

  it('returns null when the item does not belong to the given leadId (cross-lead guard)', async () => {
    const { itemId } = await insertLeadWithItem();
    const otherLeadId = ulid();
    await db.insert(schema.leads).values({ id: otherLeadId, ref: `OTHER-${otherLeadId}`, contactMobile: '09120000006', source: 'table' });
    await expect(updateLeadItem(itemId, otherLeadId, { qty: 9 })).resolves.toBeNull();
  });

  it('returns null for a non-existent item id', async () => {
    const { leadId } = await insertLeadWithItem();
    await expect(updateLeadItem(ulid(), leadId, { qty: 1 })).resolves.toBeNull();
  });
});

/**
 * Item 86. The PATCH route authorizes a claim against a snapshot read in an
 * EARLIER, separate query, so the check and the write are not atomic: two reps
 * who both open the same unassigned lead both see `assigneeId === null`, both
 * pass `canChangeLeadAssignee`, and the second unconditional UPDATE silently
 * overwrote the first — the losing rep's UI still said the lead was theirs, so
 * two reps phone the same customer. `ifAssigneeId` closes that window in the
 * database, which is the only place it can actually be closed.
 */
describe('updateLead — ifAssigneeId compare-and-swap (item 86)', () => {
  const REP_A = 'cas-rep-a';
  const REP_B = 'cas-rep-b';

  beforeAll(async () => {
    // leads.assignee_id is a real FK to users — claims must point at real staff.
    await db.insert(schema.users).values([
      { id: REP_A, mobile: '09120000101', name: 'کارشناس الف', role: 'sales' },
      { id: REP_B, mobile: '09120000102', name: 'کارشناس ب', role: 'sales' },
    ]);
  });

  async function insertUnassignedLead(): Promise<string> {
    const id = ulid();
    await db.insert(schema.leads).values({
      id,
      ref: `CAS-${id}`,
      contactMobile: '09120000009',
      source: 'table',
    });
    return id;
  }

  async function ownerOf(id: string): Promise<string | null> {
    const rows = await db.select().from(schema.leads).where(eq(schema.leads.id, id));
    return rows[0]!.assigneeId;
  }

  it('lets exactly ONE of two concurrent claims on the same unassigned lead win', async () => {
    const id = await insertUnassignedLead();

    // Both reps raced through the guard on the same `before.assigneeId === null`.
    const [a, b] = await Promise.all([
      updateLead(id, { assigneeId: REP_A }, { ifAssigneeId: null }),
      updateLead(id, { assigneeId: REP_B }, { ifAssigneeId: null }),
    ]);

    const winners = [a, b].filter(Boolean);
    expect(winners).toHaveLength(1);
    // And the DB agrees with whichever one was told it won — the losing rep
    // gets null (the route turns that into a 409), never a false success.
    expect(await ownerOf(id)).toBe(winners[0]!.assigneeId);
  });

  it('refuses to overwrite a claim that landed after the caller read its snapshot', async () => {
    const id = await insertUnassignedLead();
    await updateLead(id, { assigneeId: REP_A }, { ifAssigneeId: null });

    // Rep B's request was authorized against the stale "unassigned" snapshot.
    const stale = await updateLead(id, { assigneeId: REP_B }, { ifAssigneeId: null });

    expect(stale).toBeNull();
    expect(await ownerOf(id)).toBe(REP_A);
  });

  it('allows the legitimate hand-back and hand-over — the guard blocks staleness, not the operation', async () => {
    const id = await insertUnassignedLead();
    await updateLead(id, { assigneeId: REP_A }, { ifAssigneeId: null });

    // Rep A releases their own lead (guard matches the real current owner).
    expect(await updateLead(id, { assigneeId: null }, { ifAssigneeId: REP_A })).not.toBeNull();
    expect(await ownerOf(id)).toBeNull();

    // A manager then assigns it onward, again against a fresh snapshot.
    expect(await updateLead(id, { assigneeId: REP_B }, { ifAssigneeId: null })).not.toBeNull();
    expect(await ownerOf(id)).toBe(REP_B);
  });

  it('stays unconditional when no guard is passed — existing callers are unaffected', async () => {
    const id = await insertUnassignedLead();
    await updateLead(id, { assigneeId: REP_A }, { ifAssigneeId: null });

    // No ifAssigneeId: writes regardless of ownership, exactly as before.
    expect(await updateLead(id, { status: 'won' })).not.toBeNull();
    expect(await ownerOf(id)).toBe(REP_A);
  });
});

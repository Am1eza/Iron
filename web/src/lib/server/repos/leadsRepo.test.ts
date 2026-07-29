// @vitest-environment node
/**
 * adminListLeads — from/to date-range filter (US-19.3). Assignee/status/q
 * filters are already exercised indirectly elsewhere (leads.test.ts,
 * LeadDetail's assignee select); this covers the new range filter in
 * isolation with directly-controlled createdAt values.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ulid } from 'ulid';
import { createTestDb } from '@/test/db';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import { adminListLeads, updateLeadItem } from './leadsRepo';

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

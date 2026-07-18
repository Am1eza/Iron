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

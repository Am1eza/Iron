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
import { adminListLeads } from './leadsRepo';

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

// @vitest-environment node
/**
 * Keyset (cursor) pagination — the actual failure mode OFFSET has (skipping
 * or repeating rows when new ones are inserted between page reads) can't be
 * exercised without a live-insert race, so this locks in the invariants that
 * matter: stable ordering, no duplicates/gaps across pages, and that
 * `nextCursor` is null exactly when there's nothing left.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { desc, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import { createTestDb } from '@/test/db';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import { listAudit, listAuditForExport, writeAudit } from './auditRepo';

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
}, 120_000);
afterAll(async () => {
  await close();
});

describe('listAudit — keyset pagination', () => {
  it('pages through every row exactly once, newest first, with no duplicates or gaps', async () => {
    const entityId = `sweep-${ulid()}`;
    for (let i = 0; i < 25; i++) {
      await writeAudit({ actorId: null, action: `test.${i}`, entityType: 'test-sweep', entityId });
    }

    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const { entries, nextCursor } = await listAudit({ entityType: 'test-sweep', entityId, cursor, limit: 7 });
      seen.push(...entries.map((e) => e.id));
      cursor = nextCursor ?? undefined;
      pages++;
    } while (cursor && pages < 20);

    expect(seen).toHaveLength(25);
    expect(new Set(seen).size).toBe(25); // no duplicates across page boundaries
    expect(pages).toBe(4); // 7+7+7+4

    // Newest-first, and consistent with each row's actual `at`/`id`: re-fetch
    // and confirm the returned order exactly matches the true DB order.
    const rows = await db
      .select({ id: schema.auditEntries.id })
      .from(schema.auditEntries)
      .where(sql`${schema.auditEntries.entityId} = ${entityId}`)
      .orderBy(desc(schema.auditEntries.at), desc(schema.auditEntries.id));
    expect(seen).toEqual(rows.map((r) => r.id));
  });

  it('nextCursor is null when the result fits in one page', async () => {
    const entityId = `single-${ulid()}`;
    await writeAudit({ actorId: null, action: 'test.only', entityType: 'test-single', entityId });
    const { entries, nextCursor } = await listAudit({ entityType: 'test-single', entityId, limit: 50 });
    expect(entries).toHaveLength(1);
    expect(nextCursor).toBeNull();
  });

  it('an invalid/garbage cursor is ignored rather than throwing', async () => {
    await expect(listAudit({ cursor: 'not-a-real-cursor', limit: 5 })).resolves.toBeDefined();
  });
});

describe('listAudit / listAuditForExport — actor name + action/date filters (US-23.2)', () => {
  it('carries the actor\'s name/mobile alongside the raw actorId', async () => {
    const actorId = ulid();
    await db.insert(schema.users).values({ id: actorId, mobile: '09121110001', name: 'کارشناس آزمایشی' });
    const entityId = `actor-${ulid()}`;
    await writeAudit({ actorId, action: 'test.actorName', entityType: 'test-actor', entityId });

    const { entries } = await listAudit({ entityType: 'test-actor', entityId });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ actorId, actorName: 'کارشناس آزمایشی', actorMobile: '09121110001' });
  });

  it('a system-initiated entry (actorId null) has null actor fields, not a join failure', async () => {
    const entityId = `system-${ulid()}`;
    await writeAudit({ actorId: null, action: 'test.system', entityType: 'test-system', entityId });
    const { entries } = await listAudit({ entityType: 'test-system', entityId });
    expect(entries[0]).toMatchObject({ actorId: null, actorName: null, actorMobile: null });
  });

  it('filters by action', async () => {
    const entityId = `action-${ulid()}`;
    await writeAudit({ actorId: null, action: 'lead.create', entityType: 'test-action', entityId });
    await writeAudit({ actorId: null, action: 'lead.delete', entityType: 'test-action', entityId });
    const { entries } = await listAudit({ entityType: 'test-action', entityId, action: 'lead.create' });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.action).toBe('lead.create');
  });

  it('filters by from/to date range (inclusive)', async () => {
    const entityId = `daterange-${ulid()}`;
    await writeAudit({ actorId: null, action: 'test.old', entityType: 'test-date', entityId });
    await new Promise((r) => setTimeout(r, 50));
    const cutoff = new Date(); // strictly between the two writes
    await new Promise((r) => setTimeout(r, 50));
    await writeAudit({ actorId: null, action: 'test.new', entityType: 'test-date', entityId });

    const onlyOld = await listAudit({ entityType: 'test-date', entityId, to: cutoff });
    expect(onlyOld.entries.map((e) => e.action)).toEqual(['test.old']);

    const onlyNew = await listAudit({ entityType: 'test-date', entityId, from: cutoff });
    expect(onlyNew.entries.map((e) => e.action)).toEqual(['test.new']);
  });

  it('listAuditForExport applies the same filters without a cursor', async () => {
    const entityId = `export-${ulid()}`;
    for (let i = 0; i < 3; i++) {
      await writeAudit({ actorId: null, action: 'test.export', entityType: 'test-export', entityId });
    }
    const rows = await listAuditForExport({ entityType: 'test-export', entityId });
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.action === 'test.export')).toBe(true);
  });
});

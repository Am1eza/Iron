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
import { listAudit, writeAudit } from './auditRepo';

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

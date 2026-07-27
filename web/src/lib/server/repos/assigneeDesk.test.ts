// @vitest-environment node
/**
 * assigneeDesk — the rep desk («میز کار من») query. Covers the four things
 * that were silently wrong and are easy to regress:
 *   1. overdue callbacks used to be sorted first inside a single 30-row cap,
 *      so a rep with a backlog never saw an upcoming call at all;
 *   2. won/lost leads kept surfacing on their stale callbackAt;
 *   3. the caps were invisible — no total, no hasMore;
 *   4. the row projection must stay narrow (no `context` jsonb blob).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ulid } from 'ulid';
import { createTestDb } from '@/test/db';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import { assigneeDesk, DESK_ACTIVE_LIMIT, DESK_CALLBACK_LIMIT } from './leadsRepo';

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
}, 120_000);
afterAll(async () => {
  await close();
});

const HOUR = 3_600_000;

/** Each test gets its own assignee so the desks stay isolated — the desk is
 *  scoped by assigneeId, which is exactly what makes that safe. */
async function makeRep(): Promise<string> {
  const id = ulid();
  await db.insert(schema.users).values({ id, mobile: `0912${id.slice(-7)}`, role: 'sales' });
  return id;
}

async function insertLead(assigneeId: string, over: Partial<typeof schema.leads.$inferInsert> = {}) {
  const id = ulid();
  await db.insert(schema.leads).values({
    id,
    ref: `DESK-${id}`,
    contactMobile: '09120000009',
    source: 'table',
    assigneeId,
    ...over,
  });
  return id;
}

describe('assigneeDesk — overdue vs upcoming callbacks', () => {
  it('splits the two buckets, orders each for the rep, and flags every row', async () => {
    const rep = await makeRep();
    const now = Date.now();
    const missedLongAgo = await insertLead(rep, { status: 'contacted', callbackAt: new Date(now - 72 * HOUR) });
    const missedRecently = await insertLead(rep, { status: 'new', callbackAt: new Date(now - 2 * HOUR) });
    const nextCall = await insertLead(rep, { status: 'new', callbackAt: new Date(now + 2 * HOUR) });
    const laterCall = await insertLead(rep, { status: 'contacted', callbackAt: new Date(now + 48 * HOUR) });

    const desk = await assigneeDesk(rep);

    // Newest miss first: a call missed two hours ago is still recoverable,
    // one missed three days ago mostly isn't.
    expect(desk.callbacks.overdue.rows.map((r) => r.id)).toEqual([missedRecently, missedLongAgo]);
    expect(desk.callbacks.overdue.rows.every((r) => r.isOverdue)).toBe(true);
    // Soonest first.
    expect(desk.callbacks.upcoming.rows.map((r) => r.id)).toEqual([nextCall, laterCall]);
    expect(desk.callbacks.upcoming.rows.some((r) => r.isOverdue)).toBe(false);
  });

  it('still surfaces upcoming calls when the overdue backlog alone exceeds the cap', async () => {
    const rep = await makeRep();
    const now = Date.now();
    for (let i = 1; i <= DESK_CALLBACK_LIMIT + 5; i++) {
      await insertLead(rep, { status: 'contacted', callbackAt: new Date(now - i * HOUR) });
    }
    const upcoming = await insertLead(rep, { status: 'new', callbackAt: new Date(now + HOUR) });

    const desk = await assigneeDesk(rep);

    expect(desk.callbacks.overdue.rows).toHaveLength(DESK_CALLBACK_LIMIT);
    // The whole point of the split: the backlog gets its own budget and can
    // no longer starve the scheduled call out of the response.
    expect(desk.callbacks.upcoming.rows.map((r) => r.id)).toEqual([upcoming]);
  });

  it('leaves a lead with no callbackAt out of both lists', async () => {
    const rep = await makeRep();
    await insertLead(rep, { status: 'new' });
    const desk = await assigneeDesk(rep);
    expect(desk.callbacks.overdue.total).toBe(0);
    expect(desk.callbacks.upcoming.total).toBe(0);
    expect(desk.active.rows).toHaveLength(1);
    expect(desk.active.rows[0]!.isOverdue).toBe(false);
  });
});

describe('assigneeDesk — closed and deleted leads', () => {
  it('never asks the rep to call back a won/lost lead', async () => {
    const rep = await makeRep();
    const now = Date.now();
    await insertLead(rep, { status: 'won', callbackAt: new Date(now - HOUR) });
    await insertLead(rep, { status: 'lost', callbackAt: new Date(now + HOUR) });
    const open = await insertLead(rep, { status: 'contacted', callbackAt: new Date(now + 2 * HOUR) });

    const desk = await assigneeDesk(rep);

    expect(desk.callbacks.overdue.rows).toHaveLength(0);
    expect(desk.callbacks.overdue.total).toBe(0);
    expect(desk.callbacks.upcoming.rows.map((r) => r.id)).toEqual([open]);
    expect(desk.callbacks.upcoming.total).toBe(1);
    // …but they still count towards the rep's scoreboard.
    expect(desk.stats).toMatchObject({ assigned: 3, active: 1, won: 1, lost: 1, conversionPct: 50 });
  });

  it('excludes soft-deleted leads and other reps’ leads everywhere', async () => {
    const rep = await makeRep();
    const other = await makeRep();
    const now = Date.now();
    await insertLead(rep, { status: 'new', callbackAt: new Date(now - HOUR), deletedAt: new Date() });
    await insertLead(other, { status: 'new', callbackAt: new Date(now - HOUR) });

    const desk = await assigneeDesk(rep);

    expect(desk.stats.assigned).toBe(0);
    expect(desk.active.rows).toHaveLength(0);
    expect(desk.callbacks.overdue.total).toBe(0);
  });
});

describe('assigneeDesk — totals and truncation', () => {
  it('reports the true total and hasMore when a list is capped', async () => {
    const rep = await makeRep();
    const now = Date.now();
    const upcomingCount = DESK_CALLBACK_LIMIT + 4;
    for (let i = 1; i <= upcomingCount; i++) {
      await insertLead(rep, { status: 'new', callbackAt: new Date(now + i * HOUR) });
    }

    const desk = await assigneeDesk(rep);

    expect(desk.callbacks.upcoming).toMatchObject({
      total: upcomingCount,
      hasMore: true,
      limit: DESK_CALLBACK_LIMIT,
    });
    expect(desk.callbacks.upcoming.rows).toHaveLength(DESK_CALLBACK_LIMIT);
    // An empty bucket must not claim to be truncated.
    expect(desk.callbacks.overdue).toMatchObject({ total: 0, hasMore: false });
  });

  it('keeps the active list total in step with the stats tile above it', async () => {
    const rep = await makeRep();
    const activeCount = DESK_ACTIVE_LIMIT + 7;
    for (let i = 0; i < activeCount; i++) {
      await insertLead(rep, { status: i % 2 === 0 ? 'new' : 'contacted' });
    }
    await insertLead(rep, { status: 'won' });

    const desk = await assigneeDesk(rep);

    // The tile used to read 57 above a silently-truncated 50-row table.
    expect(desk.stats.active).toBe(activeCount);
    expect(desk.active).toMatchObject({ total: activeCount, hasMore: true, limit: DESK_ACTIVE_LIMIT });
    expect(desk.active.rows).toHaveLength(DESK_ACTIVE_LIMIT);
  });

  it('says hasMore=false when everything fits', async () => {
    const rep = await makeRep();
    await insertLead(rep, { status: 'new' });
    const desk = await assigneeDesk(rep);
    expect(desk.active).toMatchObject({ total: 1, hasMore: false });
  });
});

describe('assigneeDesk — row projection', () => {
  it('does not drag the heavy `context` jsonb over the wire', async () => {
    const rep = await makeRep();
    await insertLead(rep, {
      status: 'new',
      callbackAt: new Date(Date.now() + HOUR),
      context: { transcript: [{ role: 'user', content: 'x'.repeat(2000) }] },
    });

    const desk = await assigneeDesk(rep);
    const row = desk.callbacks.upcoming.rows[0]!;

    expect(row).not.toHaveProperty('context');
    expect(Object.keys(row).sort()).toEqual(
      ['callbackAt', 'contactMobile', 'contactName', 'createdAt', 'id', 'isOverdue', 'ref', 'source', 'status'].sort(),
    );
    // The TIME must survive — the UI shows an appointment, not just a day.
    expect(row.callbackAt).toBeInstanceOf(Date);
  });
});

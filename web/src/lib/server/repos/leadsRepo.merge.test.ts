// @vitest-environment node
/**
 * Duplicate-lead detection and merge (W8) — the only IRREVERSIBLE operation in
 * the admin panel. Every test here exists because the failure it describes
 * would conflate two real customers' commercial history with no undo button.
 *
 * The rollback test in particular does NOT use a test-only seam in the repo:
 * it installs a real Postgres BEFORE UPDATE trigger on `lead_notes`, so the
 * transaction fails at step 7 — after the items have already moved — exactly
 * the way a constraint violation or a dropped connection would. What is being
 * proved is that the production `db.transaction` boundary is real, not that a
 * mock threw.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ulid } from 'ulid';
import { and, eq, sql } from 'drizzle-orm';
import { createTestDb } from '@/test/db';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import {
  findDuplicateLeads,
  mergeLeads,
  normalizedMobileKey,
  LeadMergeMissingError,
  LeadMergeMobileMismatchError,
  LeadMergeProformaActiveError,
  LeadMergeSelfError,
} from './leadsRepo';

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
}, 120_000);
afterAll(async () => {
  await close();
});

let seq = 0;
const nextRef = (prefix: string) => `${prefix}-${(seq += 1).toString().padStart(5, '0')}`;

async function seedUser(mobile: string): Promise<string> {
  const id = ulid();
  await db.insert(schema.users).values({ id, mobile });
  return id;
}

async function seedLead(opts: {
  mobile: string;
  createdAt?: Date;
  status?: 'new' | 'contacted' | 'won' | 'lost';
  assigneeId?: string | null;
  userId?: string | null;
  deletedAt?: Date | null;
  items?: number;
}): Promise<{ id: string; ref: string }> {
  const id = ulid();
  const ref = nextRef('LD');
  await db.insert(schema.leads).values({
    id,
    ref,
    contactMobile: opts.mobile,
    source: 'table',
    status: opts.status ?? 'new',
    assigneeId: opts.assigneeId ?? null,
    userId: opts.userId ?? null,
    createdAt: opts.createdAt ?? new Date(),
    deletedAt: opts.deletedAt ?? null,
  });
  for (let i = 0; i < (opts.items ?? 0); i++) {
    await db.insert(schema.leadItems).values({
      id: ulid(),
      leadId: id,
      name: `میلگرد ${i}`,
      qty: 1,
      unit: 'kg',
      order: i,
    });
  }
  return { id, ref };
}

async function seedNote(leadId: string, authorId: string): Promise<string> {
  const id = ulid();
  await db.insert(schema.leadNotes).values({ id, leadId, authorId, text: 'یادداشت آزمایشی' });
  return id;
}

async function seedProforma(
  leadId: string,
  status: 'active' | 'expired' | 'cancelled',
  validUntil = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
): Promise<string> {
  const id = ulid();
  await db.insert(schema.proformas).values({
    id,
    leadId,
    ref: nextRef('PF'),
    lines: [],
    subtotal: 1000,
    vatRate: 0.1,
    vatAmount: 100,
    total: 1100,
    validUntil,
    status,
  });
  return id;
}

async function seedRequest(userId: string, leadId: string): Promise<string> {
  const id = ulid();
  await db.insert(schema.userRequests).values({
    id,
    ref: nextRef('RQ'),
    userId,
    type: 'proforma',
    title: 'درخواست آزمایشی',
    leadId,
  });
  return id;
}

const itemsOf = (leadId: string) =>
  db.select().from(schema.leadItems).where(eq(schema.leadItems.leadId, leadId));
const notesOf = (leadId: string) =>
  db.select().from(schema.leadNotes).where(eq(schema.leadNotes.leadId, leadId));
const leadRow = async (id: string) =>
  (await db.select().from(schema.leads).where(eq(schema.leads.id, id)))[0];

const DAY = 24 * 60 * 60 * 1000;

describe('normalizedMobileKey', () => {
  it('folds every stored spelling of one Iranian number onto the same key', () => {
    const key = normalizedMobileKey('09121234567');
    expect(key).toBe('09121234567');
    for (const variant of ['۰۹۱۲۱۲۳۴۵۶۷', '+989121234567', '00989121234567', '989121234567', '0912 123 4567']) {
      expect(normalizedMobileKey(variant)).toBe(key);
    }
  });

  it('does not collapse two different numbers', () => {
    expect(normalizedMobileKey('09121234567')).not.toBe(normalizedMobileKey('09121234568'));
  });
});

describe('findDuplicateLeads', () => {
  it('finds a same-mobile lead inside the window and reports its counts', async () => {
    const author = await seedUser('09150000001');
    const subject = await seedLead({ mobile: '09121110001', items: 2 });
    const other = await seedLead({ mobile: '09121110001', createdAt: new Date(Date.now() - 5 * DAY), items: 3 });
    await seedNote(other.id, author);
    await seedProforma(other.id, 'expired');

    const res = await findDuplicateLeads(subject.id);
    expect(res.windowDays).toBe(30);
    expect(res.candidates).toHaveLength(1);
    expect(res.candidates[0]!.id).toBe(other.id);
    expect(res.candidates[0]!.ref).toBe(other.ref);
    expect(res.candidates[0]!.itemCount).toBe(3);
    expect(res.candidates[0]!.noteCount).toBe(1);
    expect(res.candidates[0]!.proformaCount).toBe(1);
    expect(res.candidates[0]!.hasActiveProforma).toBe(false);
  });

  it('matches across DIFFERENT stored spellings of the same number', async () => {
    // mobileSchema validates but never transforms, so the column really does
    // hold whatever the client posted — this is the case the JS re-check on
    // both sides exists for.
    const subject = await seedLead({ mobile: '09121110002' });
    const other = await seedLead({ mobile: '+989121110002', createdAt: new Date(Date.now() - 2 * DAY) });

    const res = await findDuplicateLeads(subject.id);
    expect(res.candidates.map((c) => c.id)).toEqual([other.id]);
  });

  it('ignores a same-mobile lead OUTSIDE the window', async () => {
    const subject = await seedLead({ mobile: '09121110003' });
    await seedLead({ mobile: '09121110003', createdAt: new Date(Date.now() - 240 * DAY) });

    const res = await findDuplicateLeads(subject.id);
    expect(res.candidates).toHaveLength(0);
  });

  it('the window is the GAP between the two leads, not "the last 30 days"', async () => {
    // Both leads are a year old and two days apart. A `now - 30d` window would
    // see nothing here — and this is exactly when someone finally opens the
    // older of a real duplicate pair.
    const subject = await seedLead({ mobile: '09121110004', createdAt: new Date(Date.now() - 365 * DAY) });
    const other = await seedLead({ mobile: '09121110004', createdAt: new Date(Date.now() - 367 * DAY) });

    const res = await findDuplicateLeads(subject.id);
    expect(res.candidates.map((c) => c.id)).toEqual([other.id]);
  });

  it('ignores soft-deleted leads', async () => {
    const subject = await seedLead({ mobile: '09121110005' });
    await seedLead({ mobile: '09121110005', deletedAt: new Date() });

    const res = await findDuplicateLeads(subject.id);
    expect(res.candidates).toHaveLength(0);
  });

  it('ignores a different mobile', async () => {
    const subject = await seedLead({ mobile: '09121110006' });
    await seedLead({ mobile: '09121110007' });

    const res = await findDuplicateLeads(subject.id);
    expect(res.candidates).toHaveLength(0);
  });

  it('never returns the subject lead itself', async () => {
    const subject = await seedLead({ mobile: '09121110008' });
    const res = await findDuplicateLeads(subject.id);
    expect(res.candidates).toHaveLength(0);
  });

  it('reports the subject lead’s own active proforma', async () => {
    const subject = await seedLead({ mobile: '09121110009' });
    await seedLead({ mobile: '09121110009' });
    await seedProforma(subject.id, 'active');

    const res = await findDuplicateLeads(subject.id);
    expect(res.subjectHasActiveProforma).toBe(true);
    expect(res.candidates).toHaveLength(1);
  });
});

describe('mergeLeads — children move', () => {
  it('moves items, notes, proformas and user_requests onto the winner', async () => {
    const actor = await seedUser('09150000010');
    const customer = await seedUser('09122220001');
    const winner = await seedLead({ mobile: '09122220001', items: 2, userId: customer });
    const loser = await seedLead({ mobile: '09122220001', items: 3, userId: customer });
    const loserNote = await seedNote(loser.id, actor);
    const loserProforma = await seedProforma(loser.id, 'expired');
    const loserRequest = await seedRequest(customer, loser.id);

    const result = await mergeLeads(winner.id, loser.id, actor);

    expect(result.movedItemIds).toHaveLength(3);
    expect(result.movedNoteIds).toEqual([loserNote]);
    expect(result.movedProformaIds).toEqual([loserProforma]);
    expect(result.movedRequestIds).toEqual([loserRequest]);

    expect(await itemsOf(winner.id)).toHaveLength(5);
    expect(await itemsOf(loser.id)).toHaveLength(0);

    const proformaRows = await db
      .select()
      .from(schema.proformas)
      .where(eq(schema.proformas.id, loserProforma));
    expect(proformaRows[0]!.leadId).toBe(winner.id);

    const requestRows = await db
      .select()
      .from(schema.userRequests)
      .where(eq(schema.userRequests.id, loserRequest));
    expect(requestRows[0]!.leadId).toBe(winner.id);

    // The moved note plus the audit-trail note the merge itself writes.
    const winnerNotes = await notesOf(winner.id);
    expect(winnerNotes.map((n) => n.id)).toContain(loserNote);
    expect(winnerNotes).toHaveLength(2);
    expect(await notesOf(loser.id)).toHaveLength(0);
  });

  it('records the loser ref in the winner’s context.mergedFrom, and changes nothing else about the winner', async () => {
    const actor = await seedUser('09150000011');
    const other = await seedUser('09150000012');
    const winner = await seedLead({ mobile: '09122220002', status: 'contacted', assigneeId: actor });
    const loser = await seedLead({ mobile: '09122220002', status: 'won', assigneeId: other });

    await mergeLeads(winner.id, loser.id, actor);

    const row = await leadRow(winner.id);
    expect(row!.context?.mergedFrom).toEqual([loser.ref]);
    // Explicitly NOT merged — silent reassignment takes a lead off someone's
    // desk without telling them, and status/callback are the winner's own.
    expect(row!.status).toBe('contacted');
    expect(row!.assigneeId).toBe(actor);
    expect(row!.deletedAt).toBeNull();
  });

  it('lead_items.order has no duplicates on the survivor', async () => {
    const actor = await seedUser('09150000013');
    const winner = await seedLead({ mobile: '09122220003', items: 3 });
    const loser = await seedLead({ mobile: '09122220003', items: 4 });

    await mergeLeads(winner.id, loser.id, actor);

    const orders = (await itemsOf(winner.id)).map((i) => i.order);
    expect(orders).toHaveLength(7);
    expect(new Set(orders).size).toBe(7);
    // The winner's own lines keep their places; the loser's land after them.
    expect([...orders].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('handles a winner with no items at all (max(order) is NULL)', async () => {
    const actor = await seedUser('09150000014');
    const winner = await seedLead({ mobile: '09122220004', items: 0 });
    const loser = await seedLead({ mobile: '09122220004', items: 2 });

    await mergeLeads(winner.id, loser.id, actor);

    const orders = (await itemsOf(winner.id)).map((i) => i.order).sort((a, b) => a - b);
    expect(orders).toEqual([0, 1]);
  });
});

describe('mergeLeads — the loser is archived, never destroyed', () => {
  it('soft-deletes the loser and leaves its row in place', async () => {
    const actor = await seedUser('09150000020');
    const winner = await seedLead({ mobile: '09122220010' });
    const loser = await seedLead({ mobile: '09122220010' });

    const result = await mergeLeads(winner.id, loser.id, actor);
    expect(result.loser.deletedAt).not.toBeNull();

    const row = await leadRow(loser.id);
    expect(row).toBeDefined();
    expect(row!.deletedAt).not.toBeNull();
    expect(row!.ref).toBe(loser.ref);
  });

  it('a historical proforma keeps its ref and stays resolvable — the customer may hold an SMS link to it', async () => {
    // lead_items / lead_notes / proformas are all onDelete:'cascade'. A hard
    // DELETE of the loser would 404 a document already sent to a customer.
    const actor = await seedUser('09150000021');
    const winner = await seedLead({ mobile: '09122220011' });
    const loser = await seedLead({ mobile: '09122220011' });
    const proformaId = await seedProforma(loser.id, 'expired');
    const before = (await db.select().from(schema.proformas).where(eq(schema.proformas.id, proformaId)))[0]!;

    await mergeLeads(winner.id, loser.id, actor);

    const after = (await db.select().from(schema.proformas).where(eq(schema.proformas.id, proformaId)))[0];
    expect(after).toBeDefined();
    expect(after!.ref).toBe(before.ref);
    expect(after!.total).toBe(before.total);
    expect(after!.leadId).toBe(winner.id);
  });
});

describe('mergeLeads — refusals', () => {
  it('refuses merging a lead into itself', async () => {
    const actor = await seedUser('09150000030');
    const lead = await seedLead({ mobile: '09122220020', items: 2 });

    await expect(mergeLeads(lead.id, lead.id, actor)).rejects.toBeInstanceOf(LeadMergeSelfError);
    expect((await leadRow(lead.id))!.deletedAt).toBeNull();
    expect(await itemsOf(lead.id)).toHaveLength(2);
  });

  it('refuses when the loser is already archived', async () => {
    const actor = await seedUser('09150000031');
    const winner = await seedLead({ mobile: '09122220021' });
    const loser = await seedLead({ mobile: '09122220021', deletedAt: new Date() });

    await expect(mergeLeads(winner.id, loser.id, actor)).rejects.toBeInstanceOf(LeadMergeMissingError);
  });

  it('refuses when the winner does not exist', async () => {
    const actor = await seedUser('09150000032');
    const loser = await seedLead({ mobile: '09122220022' });
    await expect(mergeLeads(ulid(), loser.id, actor)).rejects.toBeInstanceOf(LeadMergeMissingError);
  });

  it('refuses when the normalised mobiles differ — never trusts the caller', async () => {
    const actor = await seedUser('09150000033');
    const winner = await seedLead({ mobile: '09122220023', items: 1 });
    const loser = await seedLead({ mobile: '09122220024', items: 1 });

    await expect(mergeLeads(winner.id, loser.id, actor)).rejects.toBeInstanceOf(LeadMergeMobileMismatchError);
    expect(await itemsOf(loser.id)).toHaveLength(1);
    expect((await leadRow(loser.id))!.deletedAt).toBeNull();
  });

  it('accepts two different stored spellings of the SAME number', async () => {
    const actor = await seedUser('09150000034');
    const winner = await seedLead({ mobile: '09122220025' });
    const loser = await seedLead({ mobile: '+989122220025' });

    await expect(mergeLeads(winner.id, loser.id, actor)).resolves.toBeDefined();
  });

  it('refuses when the LOSER has an active proforma', async () => {
    const actor = await seedUser('09150000035');
    const winner = await seedLead({ mobile: '09122220026', items: 1 });
    const loser = await seedLead({ mobile: '09122220026', items: 1 });
    await seedProforma(loser.id, 'active');

    await expect(mergeLeads(winner.id, loser.id, actor)).rejects.toBeInstanceOf(LeadMergeProformaActiveError);
    expect(await itemsOf(loser.id)).toHaveLength(1);
    expect((await leadRow(loser.id))!.deletedAt).toBeNull();
  });

  it('refuses when the WINNER has an active proforma', async () => {
    const actor = await seedUser('09150000036');
    const winner = await seedLead({ mobile: '09122220027', items: 1 });
    const loser = await seedLead({ mobile: '09122220027', items: 1 });
    await seedProforma(winner.id, 'active');

    const err = await mergeLeads(winner.id, loser.id, actor).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LeadMergeProformaActiveError);
    expect((err as LeadMergeProformaActiveError).side).toBe('winner');
    expect(await itemsOf(loser.id)).toHaveLength(1);
  });

  it('a LAPSED "active" proforma does not block — the expiry sweep runs only every 10 minutes', async () => {
    const actor = await seedUser('09150000037');
    const winner = await seedLead({ mobile: '09122220028' });
    const loser = await seedLead({ mobile: '09122220028' });
    await seedProforma(loser.id, 'active', new Date(Date.now() - 60_000));

    await expect(mergeLeads(winner.id, loser.id, actor)).resolves.toBeDefined();
  });

  it('an expired or cancelled proforma does not block', async () => {
    const actor = await seedUser('09150000038');
    const winner = await seedLead({ mobile: '09122220029' });
    const loser = await seedLead({ mobile: '09122220029' });
    await seedProforma(loser.id, 'expired');
    await seedProforma(winner.id, 'cancelled');

    await expect(mergeLeads(winner.id, loser.id, actor)).resolves.toBeDefined();
  });
});

describe('mergeLeads — rollback', () => {
  it('a failure AFTER the items move leaves BOTH leads completely untouched', async () => {
    const actor = await seedUser('09150000040');
    const customer = await seedUser('09122220030');
    const winner = await seedLead({ mobile: '09122220030', items: 2, userId: customer });
    const loser = await seedLead({ mobile: '09122220030', items: 3, userId: customer });
    const loserNote = await seedNote(loser.id, actor);
    const loserProforma = await seedProforma(loser.id, 'expired');
    const loserRequest = await seedRequest(customer, loser.id);

    const snapshot = async () => ({
      winnerLead: await leadRow(winner.id),
      loserLead: await leadRow(loser.id),
      winnerItems: (await itemsOf(winner.id)).map((i) => `${i.id}:${i.order}`).sort(),
      loserItems: (await itemsOf(loser.id)).map((i) => `${i.id}:${i.order}`).sort(),
      winnerNotes: (await notesOf(winner.id)).map((n) => n.id).sort(),
      loserNotes: (await notesOf(loser.id)).map((n) => n.id).sort(),
      proformaLead: (await db.select().from(schema.proformas).where(eq(schema.proformas.id, loserProforma)))[0]!.leadId,
      requestLead: (await db.select().from(schema.userRequests).where(eq(schema.userRequests.id, loserRequest)))[0]!
        .leadId,
    });

    const before = await snapshot();

    // A REAL mid-transaction failure, injected at the database rather than
    // through a test-only branch in the repo: the trigger fires on the
    // lead_notes UPDATE, which is step 7 — the items (step 6) have already
    // moved inside the open transaction by then.
    await db.execute(sql`
      create or replace function ahantime_test_fail_note_move() returns trigger as $$
      begin raise exception 'injected failure during note move'; end;
      $$ language plpgsql;
    `);
    await db.execute(sql`
      create trigger ahantime_test_fail_note_move
      before update on lead_notes
      for each row execute function ahantime_test_fail_note_move();
    `);

    try {
      // drizzle wraps the driver error, so the assertion pins the STATEMENT
      // that died — `update "lead_notes"`, i.e. step 7, with step 6's item
      // move already applied inside the open transaction.
      await expect(mergeLeads(winner.id, loser.id, actor)).rejects.toThrow(/update "lead_notes"/);
    } finally {
      await db.execute(sql`drop trigger ahantime_test_fail_note_move on lead_notes;`);
      await db.execute(sql`drop function ahantime_test_fail_note_move();`);
    }

    expect(await snapshot()).toEqual(before);
    // Spelled out, because "toEqual on a snapshot" can pass for the wrong
    // reason if the snapshot helper is ever narrowed: the items are the very
    // rows the transaction had already rewritten before it died.
    expect(await itemsOf(loser.id)).toHaveLength(3);
    expect(await itemsOf(winner.id)).toHaveLength(2);
    expect(before.loserNotes).toEqual([loserNote]);
    expect((await leadRow(loser.id))!.deletedAt).toBeNull();
    expect((await leadRow(winner.id))!.context?.mergedFrom).toBeUndefined();

    // And the merge still works once the injected fault is gone — the failure
    // left no half-applied state behind to trip over.
    await expect(mergeLeads(winner.id, loser.id, actor)).resolves.toBeDefined();
  });
});

describe('merge audit trail (as the route writes it)', () => {
  it('both entries exist, keyed on each side, and carry every moved id', async () => {
    const actor = await seedUser('09150000050');
    const customer = await seedUser('09122220040');
    const winner = await seedLead({ mobile: '09122220040', items: 1, userId: customer });
    const loser = await seedLead({ mobile: '09122220040', items: 2, status: 'contacted', userId: customer });
    await seedNote(loser.id, actor);
    await seedProforma(loser.id, 'expired');
    await seedRequest(customer, loser.id);

    const result = await mergeLeads(winner.id, loser.id, actor);

    // Mirrors POST /api/admin/leads/[id]/merge exactly — the payload has to be
    // enough to reverse the merge BY HAND.
    const { writeAudit } = await import('./auditRepo');
    const before = {
      loserId: result.loser.id,
      loserRef: result.loser.ref,
      loserStatus: result.loser.status,
      loserAssigneeId: result.loser.assigneeId,
      loserCreatedAt: result.loser.createdAt.toISOString(),
      movedItemIds: result.movedItemIds,
      movedNoteIds: result.movedNoteIds,
      movedProformaIds: result.movedProformaIds,
      movedRequestIds: result.movedRequestIds,
    };
    await writeAudit({ actorId: actor, action: 'lead.merge', entityType: 'lead', entityId: result.winner.id, before });
    await writeAudit({
      actorId: actor,
      action: 'lead.merged_into',
      entityType: 'lead',
      entityId: result.loser.id,
      before,
    });

    const onWinner = await db
      .select()
      .from(schema.auditEntries)
      .where(and(eq(schema.auditEntries.entityId, result.winner.id), eq(schema.auditEntries.action, 'lead.merge')));
    const onLoser = await db
      .select()
      .from(schema.auditEntries)
      .where(
        and(eq(schema.auditEntries.entityId, result.loser.id), eq(schema.auditEntries.action, 'lead.merged_into')),
      );

    expect(onWinner).toHaveLength(1);
    expect(onLoser).toHaveLength(1);
    for (const entry of [onWinner[0]!, onLoser[0]!]) {
      const payload = entry.before as typeof before;
      expect(payload.loserId).toBe(loser.id);
      expect(payload.loserRef).toBe(loser.ref);
      expect(payload.loserStatus).toBe('contacted');
      expect(payload.movedItemIds).toHaveLength(2);
      expect(payload.movedNoteIds).toHaveLength(1);
      expect(payload.movedProformaIds).toHaveLength(1);
      expect(payload.movedRequestIds).toHaveLength(1);
      expect(payload.loserCreatedAt).toBeTruthy();
    }
  });
});

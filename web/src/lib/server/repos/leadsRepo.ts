/**
 * Leads + proformas — the conversion spine's persistence. Lead items snapshot
 * name/price at creation; issued proformas freeze lines as jsonb.
 */
import { and, asc, desc, eq, gt, gte, ilike, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import { getDb, type DbOrTx } from '@/lib/server/db/client';
import { leads, leadItems, leadNotes, proformas } from '@/lib/server/db/schema';
import type { LineItem } from '@/lib/types/domain';

export type LeadRow = typeof leads.$inferSelect;
export type LeadItemRow = typeof leadItems.$inferSelect;
export type ProformaRow = typeof proformas.$inferSelect;

export function toLineItem(r: LeadItemRow): LineItem {
  return {
    skuId: r.skuId ?? '',
    name: r.name,
    qty: r.qty,
    unit: r.unit,
    weightKg: r.weightKg ?? undefined,
    unitPrice: r.unitPrice ?? undefined,
    lineTotal: r.lineTotal ?? undefined,
  };
}

export async function insertLead(input: {
  ref: string;
  userId?: string;
  contactName?: string;
  contactMobile: string;
  contactVerified: boolean;
  source: LeadRow['source'];
  cooperationType?: LeadRow['cooperationType'];
  context?: LeadRow['context'];
  channelPref?: LeadRow['channelPref'];
  items: Array<Omit<LineItem, 'skuId'> & { skuId?: string }>;
}, dbh?: DbOrTx): Promise<LeadRow> {
  // Lead + items must be atomic. When a caller already opened a transaction
  // (createLead's outer tx), run directly on it — do NOT open a nested
  // transaction/savepoint (pglite/tests deadlock on nesting). Standalone
  // callers get their own transaction.
  const write = async (h: DbOrTx): Promise<LeadRow> => {
    const inserted = await h
      .insert(leads)
      .values({
        id: ulid(),
        ref: input.ref,
        userId: input.userId ?? null,
        contactName: input.contactName ?? null,
        contactMobile: input.contactMobile,
        contactVerified: input.contactVerified,
        source: input.source,
        cooperationType: input.cooperationType ?? null,
        context: input.context ?? null,
        channelPref: input.channelPref ?? 'sms',
      })
      .returning();
    const lead = inserted[0]!;
    if (input.items.length > 0) {
      await h.insert(leadItems).values(
        input.items.map((item, i) => ({
          id: ulid(),
          leadId: lead.id,
          skuId: item.skuId ?? null,
          name: item.name,
          qty: item.qty,
          unit: item.unit,
          weightKg: item.weightKg ?? null,
          unitPrice: item.unitPrice ?? null,
          lineTotal: item.lineTotal ?? null,
          order: i,
        })),
      );
    }
    return lead;
  };
  return dbh ? write(dbh) : getDb().transaction(write);
}

export async function leadItemsOf(leadId: string): Promise<LeadItemRow[]> {
  return getDb()
    .select()
    .from(leadItems)
    .where(eq(leadItems.leadId, leadId))
    .orderBy(leadItems.order);
}

/** Adjust a lead's line item (qty/unitPrice) before proforma issuance
 *  (US-19.4) — `lineTotal` is always recomputed server-side from the
 *  resulting qty×unitPrice, never trusted from the caller, so it can't drift
 *  from the two numbers that produced it. Only touches fields actually
 *  passed; omitting a field keeps its current value. `leadId` is required
 *  and checked in the same query (not just the URL) — otherwise a PATCH
 *  under one lead's nested route could edit an item belonging to a
 *  different lead by guessing/reusing an item id. */
export async function updateLeadItem(
  id: string,
  leadId: string,
  patch: { qty?: number; unitPrice?: number },
): Promise<LeadItemRow | null> {
  const db = getDb();
  const current = await db
    .select()
    .from(leadItems)
    .where(and(eq(leadItems.id, id), eq(leadItems.leadId, leadId)))
    .limit(1);
  if (!current[0]) return null;
  const qty = patch.qty ?? current[0].qty;
  const unitPrice = patch.unitPrice ?? current[0].unitPrice ?? undefined;
  const lineTotal = unitPrice !== undefined ? Math.round(qty * unitPrice) : null;
  const rows = await db
    .update(leadItems)
    .set({ qty, unitPrice: unitPrice ?? null, lineTotal })
    .where(eq(leadItems.id, id))
    .returning();
  return rows[0] ?? null;
}

/** Excludes soft-deleted leads — same "gone means gone" precedent as
 *  catalog's isActive (see catalogRepo's findCategory). */
export async function findLead(id: string): Promise<LeadRow | null> {
  const rows = await getDb()
    .select()
    .from(leads)
    .where(and(eq(leads.id, id), isNull(leads.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
}

export async function leadsForUser(userId: string, mobile: string, page = 1, pageSize = 50) {
  const size = Math.min(Math.max(pageSize, 1), 100);
  const p = Math.max(page, 1);
  // limit+1: one extra row signals hasMore without a count(*) scan.
  const rows = await getDb()
    .select()
    .from(leads)
    .where(and(or(eq(leads.userId, userId), eq(leads.contactMobile, mobile)), isNull(leads.deletedAt)))
    .orderBy(desc(leads.createdAt))
    .limit(size + 1)
    .offset((p - 1) * size);
  return { rows: rows.slice(0, size), hasMore: rows.length > size };
}

/** Soft-delete — archives a spam/duplicate/test lead out of admin views
 *  without losing its audit trail (see the `deletedAt` column comment). */
export async function softDeleteLead(id: string): Promise<LeadRow | null> {
  const rows = await getDb()
    .update(leads)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(leads.id, id), isNull(leads.deletedAt)))
    .returning();
  return rows[0] ?? null;
}

export async function updateLead(
  id: string,
  patch: Partial<{
    status: LeadRow['status'];
    assigneeId: string | null;
    callbackAt: Date | null;
    contactVerified: boolean;
  }>,
): Promise<LeadRow | null> {
  const rows = await getDb()
    .update(leads)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(leads.id, id))
    .returning();
  return rows[0] ?? null;
}

export async function addLeadNote(leadId: string, authorId: string, text: string) {
  const rows = await getDb()
    .insert(leadNotes)
    .values({ id: ulid(), leadId, authorId, text })
    .returning();
  return rows[0]!;
}

export async function leadNotesOf(leadId: string) {
  return getDb()
    .select()
    .from(leadNotes)
    .where(eq(leadNotes.leadId, leadId))
    .orderBy(desc(leadNotes.at));
}

export async function adminListLeads(query: {
  status?: LeadRow['status'];
  assigneeId?: string;
  q?: string;
  /** Inclusive range on createdAt (US-19.3). */
  from?: Date;
  to?: Date;
  page?: number;
  perPage?: number;
  /** Show archived (soft-deleted) leads instead of the normal working set. */
  includeDeleted?: boolean;
}) {
  const db = getDb();
  const page = query.page ?? 1;
  const perPage = query.perPage ?? 30;
  const conds = [];
  if (!query.includeDeleted) conds.push(isNull(leads.deletedAt));
  if (query.status) conds.push(eq(leads.status, query.status));
  if (query.assigneeId) conds.push(eq(leads.assigneeId, query.assigneeId));
  if (query.from) conds.push(gte(leads.createdAt, query.from));
  if (query.to) conds.push(lte(leads.createdAt, query.to));
  if (query.q) {
    conds.push(
      or(
        ilike(leads.ref, `%${query.q}%`),
        ilike(leads.contactMobile, `%${query.q}%`),
        ilike(leads.contactName, `%${query.q}%`),
      ),
    );
  }
  const where = conds.length ? and(...conds) : undefined;
  const [rows, total] = await Promise.all([
    db
      .select()
      .from(leads)
      .where(where)
      .orderBy(desc(leads.createdAt))
      .limit(perPage)
      .offset((page - 1) * perPage),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(leads)
      .where(where),
  ]);
  return { leads: rows, total: total[0]?.n ?? 0 };
}

/* ------------------------------ proformas ------------------------------ */

export async function insertProforma(input: {
  leadId: string;
  ref: string;
  lines: LineItem[];
  subtotal: number;
  discountToman?: number;
  vatRate: number;
  vatAmount: number;
  total: number;
  validUntil: Date;
}, dbh: DbOrTx = getDb()): Promise<ProformaRow> {
  const rows = await dbh
    .insert(proformas)
    .values({ id: ulid(), status: 'active', ...input })
    .returning();
  return rows[0]!;
}

export async function findProformaByRef(ref: string): Promise<ProformaRow | null> {
  const rows = await getDb().select().from(proformas).where(eq(proformas.ref, ref)).limit(1);
  const p = rows[0];
  if (!p) return null;
  // Lazy expiry — the job also sweeps, this guarantees read correctness.
  if (p.status === 'active' && p.validUntil.getTime() < Date.now()) {
    await getDb().update(proformas).set({ status: 'expired' }).where(eq(proformas.id, p.id));
    return { ...p, status: 'expired' };
  }
  return p;
}

export async function proformasOfLead(leadId: string, dbh: DbOrTx = getDb()): Promise<ProformaRow[]> {
  return dbh
    .select()
    .from(proformas)
    .where(eq(proformas.leadId, leadId))
    .orderBy(desc(proformas.createdAt));
}

/** The proforma REGISTER — every issued proforma across all leads, joined
 *  with the lead's contact info. Before this, proformas were only visible
 *  one-lead-at-a-time inside the lead expansion; there was no place to see
 *  what's outstanding, expiring, or already converted. */
export async function listProformas(query: {
  status?: 'active' | 'expired' | 'cancelled';
  page?: number;
  perPage?: number;
}) {
  const db = getDb();
  const page = query.page ?? 1;
  const perPage = query.perPage ?? 30;
  const where = query.status ? eq(proformas.status, query.status) : undefined;
  const [rows, total] = await Promise.all([
    db
      .select({
        p: proformas,
        leadRef: leads.ref,
        contactName: leads.contactName,
        contactMobile: leads.contactMobile,
        leadStatus: leads.status,
      })
      .from(proformas)
      .innerJoin(leads, eq(proformas.leadId, leads.id))
      .where(where)
      .orderBy(desc(proformas.createdAt))
      .limit(perPage)
      .offset((page - 1) * perPage),
    db.select({ n: sql<number>`count(*)::int` }).from(proformas).where(where),
  ]);
  return {
    proformas: rows.map((r) => ({
      id: r.p.id,
      ref: r.p.ref,
      leadId: r.p.leadId,
      leadRef: r.leadRef,
      leadStatus: r.leadStatus,
      contactName: r.contactName,
      contactMobile: r.contactMobile,
      total: r.p.total,
      discountToman: r.p.discountToman,
      validUntil: r.p.validUntil.toISOString(),
      status: r.p.status,
      createdAt: r.p.createdAt.toISOString(),
    })),
    total: total[0]?.n ?? 0,
  };
}

export async function expireDueProformas(): Promise<number> {
  const rows = await getDb()
    .update(proformas)
    .set({ status: 'expired' })
    .where(and(eq(proformas.status, 'active'), sql`${proformas.validUntil} < now()`))
    .returning({ id: proformas.id });
  return rows.length;
}

/** Void an issued proforma (customer changed the order, a pricing error,
 *  etc.) — only from 'active', so an already-expired/cancelled one can't be
 *  "re-cancelled" or have its terminal state clobbered. */
export async function cancelProforma(ref: string): Promise<ProformaRow | null> {
  const rows = await getDb()
    .update(proformas)
    .set({ status: 'cancelled' })
    .where(and(eq(proformas.ref, ref), eq(proformas.status, 'active')))
    .returning();
  return rows[0] ?? null;
}


/* ------------------------------ rep desk ------------------------------- */

/** Row caps for the desk's three lists. The desk is a working surface, not a
 *  report, so the caps stay — but they are no longer invisible: every list
 *  reports its true `total` next to the capped `rows` (see DeskList). */
export const DESK_ACTIVE_LIMIT = 50;
export const DESK_CALLBACK_LIMIT = 30;

/** Statuses that still need working. A won/lost lead is off the rep's plate,
 *  including its leftover `callbackAt`. */
const DESK_OPEN_STATUSES: Array<LeadRow['status']> = ['new', 'contacted'];

/** Only the columns the desk actually renders. The unprojected `select()`
 *  this replaces also dragged `context` along — the AI-advisor transcript
 *  jsonb, kilobytes per lead — for up to 110 rows every 60s per logged-in
 *  rep, purely so the route's toDesk() could drop it. */
const deskColumns = {
  id: leads.id,
  ref: leads.ref,
  contactName: leads.contactName,
  contactMobile: leads.contactMobile,
  status: leads.status,
  source: leads.source,
  createdAt: leads.createdAt,
  callbackAt: leads.callbackAt,
};

export type DeskLeadRow = Pick<
  LeadRow,
  'id' | 'ref' | 'contactName' | 'contactMobile' | 'status' | 'source' | 'createdAt' | 'callbackAt'
> & {
  /** True when `callbackAt` is in the past — i.e. the call was missed.
   *  Always false when `callbackAt` is null. Decided server-side so every
   *  row of one response is judged against the same instant. */
  isOverdue: boolean;
};

/** A capped list plus the honest numbers behind it. `total` is the real row
 *  count matching the query, `rows` is at most `limit` of them, and
 *  `hasMore` says the two disagree — so the UI can render "نمایش ۳۰ از ۸۰"
 *  instead of silently lying by omission. */
export interface DeskList {
  rows: DeskLeadRow[];
  total: number;
  hasMore: boolean;
  limit: number;
}

/**
 * A sales rep's personal workspace («میز کار من») — scoped strictly to leads
 * assigned to THEM. Everything filters on `assigneeId`, so a rep only ever
 * sees their own book of business.
 *
 * CONTRACT (the /admin/desk UI is built against this shape):
 *
 *   stats     — counts over ALL of the rep's non-deleted leads, never capped.
 *   active    — DeskList of open leads ('new'|'contacted'), newest first.
 *   callbacks — TWO separate DeskLists, each with its own cap:
 *                 .overdue  callbackAt <= now, MOST RECENTLY missed first
 *                 .upcoming callbackAt >  now, soonest first
 *
 * Why two lists rather than one: the callback query used to be a single
 * `isNotNull(callbackAt)` ordered `asc`, capped at 30. Past callbacks sort
 * before future ones, so a rep carrying 30+ overdue calls could never see a
 * single upcoming one — the "تماس‌های پیش‌رو" panel showed nothing but
 * history. Splitting the query gives each bucket its own budget; a rep with
 * 200 missed calls still sees their next 30 scheduled ones. Overdue rows are
 * still returned (a rep MUST see what they missed) but are now the caller's
 * to separate and style, and are ordered newest-miss-first because a call
 * missed yesterday is far more recoverable than one missed in March.
 *
 * Every row also carries `isOverdue` so a UI that flattens the two lists (or
 * shows a warning marker in the active queue) doesn't have to re-derive it
 * from a clock that has since moved on.
 *
 * `createdAt`/`callbackAt` are full timestamps, serialized by the route as
 * ISO strings — the TIME matters (a 09:00 and an 18:00 callback are not the
 * same appointment) and the UI must render it, not just the Jalali date.
 */
export async function assigneeDesk(assigneeId: string): Promise<{
  stats: { assigned: number; active: number; won: number; lost: number; conversionPct: number | null };
  active: DeskList;
  callbacks: { overdue: DeskList; upcoming: DeskList };
}> {
  const db = getDb();
  // One clock for the whole desk: both row queries, the counts and the
  // per-row isOverdue flag are judged against the SAME instant, so a callback
  // due right now can't fall into both buckets (or neither) just because two
  // statements of this Promise.all ran a few milliseconds apart.
  const now = new Date();
  const base = and(eq(leads.assigneeId, assigneeId), isNull(leads.deletedAt));
  // A won/lost lead keeps whatever callbackAt it had when it was still being
  // worked; without this filter the desk kept nagging reps to call back
  // customers whose deal had already closed.
  const openCallbacks = and(base, inArray(leads.status, DESK_OPEN_STATUSES), isNotNull(leads.callbackAt));

  const [statRows, activeRows, overdueRows, upcomingRows, callbackCounts] = await Promise.all([
    db
      .select({ status: leads.status, n: sql<number>`count(*)::int` })
      .from(leads)
      .where(base)
      .groupBy(leads.status),
    db
      .select(deskColumns)
      .from(leads)
      .where(and(base, inArray(leads.status, DESK_OPEN_STATUSES)))
      .orderBy(desc(leads.createdAt))
      .limit(DESK_ACTIVE_LIMIT),
    db
      .select(deskColumns)
      .from(leads)
      .where(and(openCallbacks, lte(leads.callbackAt, now)))
      .orderBy(desc(leads.callbackAt))
      .limit(DESK_CALLBACK_LIMIT),
    db
      .select(deskColumns)
      .from(leads)
      .where(and(openCallbacks, gt(leads.callbackAt, now)))
      .orderBy(asc(leads.callbackAt))
      .limit(DESK_CALLBACK_LIMIT),
    // Both bucket totals in one pass — FILTER beats two more round trips.
    db
      .select({
        overdue: sql<number>`count(*) filter (where ${leads.callbackAt} <= ${now})::int`,
        upcoming: sql<number>`count(*) filter (where ${leads.callbackAt} > ${now})::int`,
      })
      .from(leads)
      .where(openCallbacks),
  ]);

  const counts: Record<string, number> = {};
  for (const r of statRows) counts[r.status] = Number(r.n);
  const won = counts.won ?? 0;
  const decided = won + (counts.lost ?? 0);
  // Same predicate as the active query, so the stats tile and the table can
  // never disagree — no extra count(*) needed for it.
  const activeTotal = (counts.new ?? 0) + (counts.contacted ?? 0);

  const mark = (r: (typeof activeRows)[number]): DeskLeadRow => ({
    ...r,
    isOverdue: r.callbackAt !== null && r.callbackAt.getTime() <= now.getTime(),
  });
  const list = (rows: typeof activeRows, total: number, limit: number): DeskList => ({
    rows: rows.map(mark),
    total,
    hasMore: total > rows.length,
    limit,
  });

  return {
    stats: {
      assigned: Object.values(counts).reduce((a, b) => a + b, 0),
      active: activeTotal,
      won,
      lost: counts.lost ?? 0,
      conversionPct: decided > 0 ? Math.round((won / decided) * 1000) / 10 : null,
    },
    active: list(activeRows, activeTotal, DESK_ACTIVE_LIMIT),
    callbacks: {
      overdue: list(overdueRows, Number(callbackCounts[0]?.overdue ?? 0), DESK_CALLBACK_LIMIT),
      upcoming: list(upcomingRows, Number(callbackCounts[0]?.upcoming ?? 0), DESK_CALLBACK_LIMIT),
    },
  };
}

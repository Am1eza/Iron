/**
 * Leads + proformas — the conversion spine's persistence. Lead items snapshot
 * name/price at creation; issued proformas freeze lines as jsonb.
 */
import { and, asc, desc, eq, gt, gte, ilike, inArray, isNotNull, isNull, lte, ne, or, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import { getDb, type DbOrTx } from '@/lib/server/db/client';
import { leads, leadItems, leadNotes, proformas, userRequests } from '@/lib/server/db/schema';
import { normalizeDigits, normalizeMobile, toPersianDigits } from '@/lib/utils/format';
import type { LineItem } from '@/lib/types/domain';
import type { Attribution } from '@/lib/utils/attribution';
import { likeContainsDigitVariants } from '@/lib/server/utils/likeEscape';

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
  /** First-touch campaign attribution, read from the visitor's cookie by the
   *  route handler (W28). Null for direct traffic and staff-created leads. */
  attribution?: Attribution | null;
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
        utmSource: input.attribution?.utmSource ?? null,
        utmMedium: input.attribution?.utmMedium ?? null,
        utmCampaign: input.attribution?.utmCampaign ?? null,
        landingReferrer: input.attribution?.landingReferrer ?? null,
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

/** leadItemsOf for a page of leads, in one query.
 *  Listing endpoints ran leadItemsOf + proformasOfLead per lead, so a 50-row
 *  page issued 100 concurrent queries against a 10-connection pool. Returns a
 *  Map so callers keep their per-lead shape; leads with no items are simply
 *  absent, which callers read as an empty list. */
export async function leadItemsOfMany(leadIds: readonly string[]): Promise<Map<string, LeadItemRow[]>> {
  if (leadIds.length === 0) return new Map();
  const rows = await getDb()
    .select()
    .from(leadItems)
    .where(inArray(leadItems.leadId, [...leadIds]))
    .orderBy(leadItems.order);
  const byLead = new Map<string, LeadItemRow[]>();
  for (const row of rows) {
    const list = byLead.get(row.leadId);
    if (list) list.push(row);
    else byLead.set(row.leadId, [row]);
  }
  return byLead;
}

/** An issued, still-valid proforma froze this lead's lines as jsonb, so
 *  editing the lead's items afterwards makes the customer's quote and the
 *  lead permanently disagree with nothing recording the divergence. Carries
 *  the blocking `proformaRef` so the route can name it in the 409 and tell
 *  the rep to cancel + re-issue instead of silently repricing behind the
 *  customer's back. */
export class LeadItemLockedError extends Error {
  readonly proformaRef: string;
  constructor(proformaRef: string) {
    super(`lead item locked by active proforma ${proformaRef}`);
    this.proformaRef = proformaRef;
  }
}

/** Units sold as countable pieces — «۳٫۷ شاخه» is a typo, not an order, and
 *  it propagates straight into the frozen proforma lines and the SMS'd
 *  total. kg/meter stay fractional (۲٫۵ تن is a real quantity), which is why
 *  this check cannot live in the route's schema: only something that knows
 *  the item's unit can apply it. That used to mean only the stored row, so
 *  the check existed on the admin edit path alone and a fractional «شاخه»
 *  could still be created. leads.service.ts now resolves the SKU's own unit
 *  while pricing, so it applies the same rule on the create path. */
export const WHOLE_PIECE_UNITS: ReadonlySet<LeadItemRow['unit']> = new Set(['branch', 'sheet', 'piece']);

/** Rejects a fractional qty on a piece-sold unit; carries the unit so the
 *  route can name it in Persian («واحد شاخه»). */
export class WholeUnitQtyError extends Error {
  readonly unit: LeadItemRow['unit'];
  constructor(unit: LeadItemRow['unit']) {
    super(`fractional qty is not allowed for unit ${unit}`);
    this.unit = unit;
  }
}

/** The updated row, plus the two things an auditor needs and the row alone
 *  can't give: what it looked like BEFORE (the audit entry used to record
 *  `null` as the before-state of a money field) and the lead's human ref, so
 *  "which deal was repriced" doesn't need a second lookup. */
export interface UpdatedLeadItem extends LeadItemRow {
  before: LeadItemRow;
  leadRef: string;
}

/** Adjust a lead's line item (qty/unitPrice) — `lineTotal` is always
 *  recomputed server-side from the resulting qty×unitPrice, never trusted
 *  from the caller, so it can't drift from the two numbers that produced it.
 *  Only touches fields actually passed; omitting a field keeps its current
 *  value, while an explicit `unitPrice: null` clears it («بدون قیمت»).
 *  null is NOT the same as 0: 0 is a real (if odd) price that belongs on the
 *  quote, whereas the old code turned a cleared price box into a 0/0 line
 *  that the proforma route's truthiness filter then dropped from the
 *  customer's quote without a word.
 *
 *  `leadId` is required and checked in the same query (not just the URL) —
 *  otherwise a PATCH under one lead's nested route could edit an item
 *  belonging to a different lead by guessing/reusing an item id.
 *
 *  Throws `LeadItemLockedError` when the lead already has an ACTIVE proforma
 *  (the docstring here used to *claim* "before proforma issuance" while
 *  nothing enforced it). Expired/cancelled ones don't block — that quote is
 *  dead, re-pricing for a fresh one is the whole point. Read + guard + write
 *  share one transaction so a proforma issued mid-edit can't be missed by
 *  the check and then contradicted by the write. */
export async function updateLeadItem(
  id: string,
  leadId: string,
  patch: { qty?: number; unitPrice?: number | null },
): Promise<UpdatedLeadItem | null> {
  return getDb().transaction(async (tx) => {
    const current = await tx
      .select({ item: leadItems, leadRef: leads.ref })
      .from(leadItems)
      .innerJoin(leads, eq(leadItems.leadId, leads.id))
      .where(and(eq(leadItems.id, id), eq(leadItems.leadId, leadId)))
      .limit(1);
    const before = current[0]?.item;
    if (!before) return null;

    // `validUntil > now` as well as status='active': the expiry sweep runs
    // every 10 minutes, so a proforma that timed out 9 minutes ago is still
    // stored 'active' — blocking on it would freeze a lead behind a quote
    // the customer can no longer accept (findProformaByRef lazily expires
    // the same way on read).
    const blocking = await tx
      .select({ ref: proformas.ref })
      .from(proformas)
      .where(and(eq(proformas.leadId, leadId), eq(proformas.status, 'active'), gt(proformas.validUntil, new Date())))
      .orderBy(desc(proformas.createdAt))
      .limit(1);
    if (blocking[0]) throw new LeadItemLockedError(blocking[0].ref);

    const qty = patch.qty ?? before.qty;
    if (!Number.isInteger(qty) && WHOLE_PIECE_UNITS.has(before.unit)) throw new WholeUnitQtyError(before.unit);
    // undefined = field not sent (keep what's stored); null = explicitly unpriced.
    const unitPrice = patch.unitPrice === undefined ? before.unitPrice : patch.unitPrice;
    const lineTotal = unitPrice === null ? null : Math.round(qty * unitPrice);
    const rows = await tx
      .update(leadItems)
      .set({ qty, unitPrice, lineTotal })
      .where(eq(leadItems.id, id))
      .returning();
    const after = rows[0];
    return after ? { ...after, before, leadRef: current[0]!.leadRef } : null;
  });
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

/** Ownership facts only, deliberately IGNORING deletedAt — for cross-domain
 *  authorization (the orders route's ownership check). A lead archived
 *  AFTER converting to an order (spam/duplicate cleanup, unrelated to the
 *  order itself) must not silently reopen that order to every leads:write
 *  rep just because findLead()'s normal "gone means gone" filter now hides
 *  it — the order is still very much not gone. */
export async function leadOwnerInfo(
  id: string,
): Promise<{ assigneeId: string | null; contactMobile: string; contactName: string | null } | null> {
  const rows = await getDb()
    .select({ assigneeId: leads.assigneeId, contactMobile: leads.contactMobile, contactName: leads.contactName })
    .from(leads)
    .where(eq(leads.id, id))
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

/**
 * Urgency tier — 0 is most urgent. One coherent CASE feeds both the tier and
 * the per-tier tiebreak timestamp, instead of two independently-reasoned
 * expressions that could disagree with each other:
 *
 *   0  new                                — never contacted at all
 *   1  contacted, callback due or overdue  — a promise already broken
 *   2  contacted, no callback set          — drifting with no plan
 *   3  contacted, callback still ahead     — has a plan, not yet due
 *   4  won / lost                          — closed, nothing to do
 *
 * Tier 0 breaks ties oldest-`createdAt`-first (the longest-ignored new lead
 * surfaces first); tier 1 by the most-overdue `callbackAt`; tier 2 by the
 * stalest `updatedAt`; tier 3 by the soonest upcoming `callbackAt`.
 * `leads.id` is the final tiebreaker — pagination needs a fully
 * deterministic order, or two rows sharing a timestamp could drift between
 * page loads (a lead skipped or duplicated across pages 1 and 2).
 */
const URGENCY_TIER = sql`
  CASE
    WHEN ${leads.status} = 'new' THEN 0
    WHEN ${leads.status} = 'contacted' AND ${leads.callbackAt} IS NOT NULL AND ${leads.callbackAt} <= now() THEN 1
    WHEN ${leads.status} = 'contacted' AND ${leads.callbackAt} IS NULL THEN 2
    WHEN ${leads.status} = 'contacted' THEN 3
    ELSE 4
  END
`;
const URGENCY_TIEBREAK = sql`
  CASE
    WHEN ${leads.status} = 'new' THEN ${leads.createdAt}
    WHEN ${leads.status} = 'contacted' AND ${leads.callbackAt} IS NOT NULL THEN ${leads.callbackAt}
    ELSE ${leads.updatedAt}
  END
`;

export async function adminListLeads(query: {
  status?: LeadRow['status'];
  assigneeId?: string;
  source?: string;
  q?: string;
  /** Inclusive range on createdAt (US-19.3). */
  from?: Date;
  to?: Date;
  page?: number;
  perPage?: number;
  /** Show archived (soft-deleted) leads instead of the normal working set. */
  includeDeleted?: boolean;
  /** 'newest' (default): the original plain most-recent-first order —
   *  unaffected, so the CSV export and every existing/未来 caller that
   *  doesn't ask for 'urgency' keeps its exact current behaviour. 'urgency':
   *  never-contacted first, then overdue/stale/plan, closed last — see
   *  URGENCY_TIER above. Only the interactive list route opts into it. */
  sort?: 'urgency' | 'newest';
}) {
  const db = getDb();
  const page = query.page ?? 1;
  // Clamp: the route only floors this (Math.max(1, ...)), so an unbounded
  // perPage turned a paginated CRM into a one-request dump of every
  // customer name and mobile. Matches articlesRepo/catalogAdminRepo/
  // alertsRepo, which already clamp. Done in the repo, not the route, so
  // internal callers (admin/search) are covered too.
  const perPage = Math.min(100, Math.max(1, Math.floor(query.perPage ?? 30)));
  const conds = [];
  if (!query.includeDeleted) conds.push(isNull(leads.deletedAt));
  if (query.status) conds.push(eq(leads.status, query.status));
  if (query.assigneeId) conds.push(eq(leads.assigneeId, query.assigneeId));
  if (query.source) conds.push(eq(leads.source, query.source as LeadRow['source']));
  if (query.from) conds.push(gte(leads.createdAt, query.from));
  if (query.to) conds.push(lte(leads.createdAt, query.to));
  if (query.q) {
    // Both digit spellings: ref and contactMobile are stored Latin-only, so a
    // rep on a Persian keyboard searching «۰۹۱۲…» used to match nothing.
    const terms = likeContainsDigitVariants(query.q);
    conds.push(
      or(
        ...terms.flatMap((q) => [ilike(leads.ref, q), ilike(leads.contactMobile, q), ilike(leads.contactName, q)]),
      ),
    );
  }
  const where = conds.length ? and(...conds) : undefined;
  const orderBy =
    query.sort === 'urgency'
      ? [sql`${URGENCY_TIER} ASC`, sql`${URGENCY_TIEBREAK} ASC`, asc(leads.id)]
      : [desc(leads.createdAt), asc(leads.id)];
  const [rows, total] = await Promise.all([
    db
      .select()
      .from(leads)
      .where(where)
      .orderBy(...orderBy)
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

/** proformasOfLead for a page of leads, in one query — see leadItemsOfMany.
 *  Newest-first ordering is preserved within each lead's list. */
export async function proformasOfLeads(leadIds: readonly string[]): Promise<Map<string, ProformaRow[]>> {
  if (leadIds.length === 0) return new Map();
  const rows = await getDb()
    .select()
    .from(proformas)
    .where(inArray(proformas.leadId, [...leadIds]))
    .orderBy(desc(proformas.createdAt));
  const byLead = new Map<string, ProformaRow[]>();
  for (const row of rows) {
    const list = byLead.get(row.leadId);
    if (list) list.push(row);
    else byLead.set(row.leadId, [row]);
  }
  return byLead;
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
  // Clamp: the route only floors this (Math.max(1, ...)), so an unbounded
  // perPage turned a paginated CRM into a one-request dump of every
  // customer name and mobile. Matches articlesRepo/catalogAdminRepo/
  // alertsRepo, which already clamp. Done in the repo, not the route, so
  // internal callers (admin/search) are covered too.
  const perPage = Math.min(100, Math.max(1, Math.floor(query.perPage ?? 30)));
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

/* --------------------- duplicate detection & merge --------------------- */

/**
 * The ONE identity key two leads are compared on. `leads.contactMobile` is the
 * only identifying column on the table (`userId` is nullable — guest leads are
 * first-class — `contactName` is nullable, and there is no company name and no
 * email at all), so everything below hangs off this function.
 *
 * It must be applied on BOTH sides of every comparison, because the stored
 * value is NOT guaranteed canonical: `mobileSchema` (validation/schemas.ts)
 * only *validates* — it has no `.transform()` — so `createLead` writes through
 * whatever the client posted. «۰۹۱۲۱۲۳۴۵۶۷», «+989121234567» and «0912 123
 * 4567» all pass validation and all land in the column verbatim, and all three
 * are the same customer.
 *
 * `normalizeMobile` is Iran-only by design (it returns null for anything that
 * isn't 09XXXXXXXXX after digit folding). Non-Iran numbers are stored as E.164
 * by PhoneField, so they fall back to a digit-folded, punctuation-stripped form
 * — same idea, no Iran-specific prefix rewriting.
 */
export function normalizedMobileKey(raw: string): string {
  return normalizeMobile(raw) ?? normalizeDigits(raw).replace(/[^\d+]/g, '');
}

/**
 * The exact stored spellings that are all the SAME number as `raw`, used as an
 * index-served `IN (…)` pre-filter on `leads_contact_mobile_idx`.
 *
 * This is deliberately a WIDENING filter, never the decision: every row it
 * returns is re-checked in JS with `normalizedMobileKey` on both sides. A
 * functional-expression equality (`translate(contact_mobile, …) = …`) would be
 * exhaustive but could not use the btree index, turning a seq scan of the whole
 * leads table into the cost of opening any lead's detail page. The variants
 * below cover every form the write paths can actually produce (canonical,
 * E.164, 0098/98 prefixed, Persian digits) plus the subject's own raw stored
 * string, so an identically-typed pair matches even in a spelling not listed
 * here. A miss costs a rep thirty seconds; a seq scan costs every page view.
 */
function mobileMatchVariants(raw: string): string[] {
  const key = normalizedMobileKey(raw);
  const variants = new Set<string>([raw.trim(), key]);
  if (/^09\d{9}$/.test(key)) {
    const national = key.slice(1); // 9XXXXXXXXX
    variants.add(`+98${national}`);
    variants.add(`0098${national}`);
    variants.add(`98${national}`);
    variants.add(toPersianDigits(key));
  }
  return [...variants].filter((v) => v.length > 0);
}

/** Default recency window for duplicate detection, in days — see
 *  `findDuplicateLeads`. */
export const DUPLICATE_WINDOW_DAYS = 30;

export interface DuplicateLeadCandidate {
  id: string;
  ref: string;
  status: LeadRow['status'];
  assigneeId: string | null;
  contactName: string | null;
  createdAt: Date;
  itemCount: number;
  noteCount: number;
  proformaCount: number;
  /** Same predicate the merge guard uses — lets the UI refuse up front instead
   *  of letting the rep discover the block only after confirming. */
  hasActiveProforma: boolean;
}

export interface DuplicateLeadsResult {
  windowDays: number;
  /** The SUBJECT lead's own active-proforma state — the merge is refused when
   *  EITHER side has one, so the alert needs both halves of that answer. */
  subjectHasActiveProforma: boolean;
  candidates: DuplicateLeadCandidate[];
}

/**
 * Other live leads carrying the SAME normalised mobile as `leadId`, within
 * `withinDays` of that lead's own `createdAt`.
 *
 * Exact normalised mobile only — nothing fuzzy, ever. Levenshtein over Persian
 * names (ZWNJ, ی/ك variance) produces false positives, and one false positive
 * that a rep acts on merges two real customers' commercial history with no undo
 * button. The cost asymmetry is total.
 *
 * The window is measured as the GAP BETWEEN THE TWO LEADS, not "the last 30
 * days from now": two orders from the same number eight months apart are two
 * genuine purchases, and that is a fact about the pair, not about today's date.
 * A "now − 30d" window would also go blind on both leads of a real duplicate
 * pair the moment the pair is 31 days old, which is exactly when someone
 * finally opens the older one.
 */
export async function findDuplicateLeads(
  leadId: string,
  withinDays = DUPLICATE_WINDOW_DAYS,
): Promise<DuplicateLeadsResult> {
  const db = getDb();
  const empty: DuplicateLeadsResult = { windowDays: withinDays, subjectHasActiveProforma: false, candidates: [] };
  const subjectRows = await db
    .select({ id: leads.id, contactMobile: leads.contactMobile, createdAt: leads.createdAt })
    .from(leads)
    .where(and(eq(leads.id, leadId), isNull(leads.deletedAt)))
    .limit(1);
  const subject = subjectRows[0];
  if (!subject) return empty;

  const subjectKey = normalizedMobileKey(subject.contactMobile);
  if (!subjectKey) return empty;

  const windowMs = withinDays * 24 * 60 * 60 * 1000;
  const from = new Date(subject.createdAt.getTime() - windowMs);
  const to = new Date(subject.createdAt.getTime() + windowMs);

  const rows = await db
    .select({
      id: leads.id,
      ref: leads.ref,
      status: leads.status,
      assigneeId: leads.assigneeId,
      contactName: leads.contactName,
      contactMobile: leads.contactMobile,
      createdAt: leads.createdAt,
      // `leads.id` is written out LITERALLY, not interpolated as `${leads.id}`:
      // inside a select-field expression drizzle renders a Column as a bare
      // `"id"`, which a correlated subquery then resolves against its OWN from
      // list (`lead_items.id`) instead of the outer lead. The result is not an
      // error — it is a silent, always-zero count. Caught by the
      // findDuplicateLeads count assertions in leadsRepo.merge.test.ts.
      itemCount: sql<number>`(select count(*)::int from lead_items li where li.lead_id = leads.id)`,
      noteCount: sql<number>`(select count(*)::int from lead_notes ln where ln.lead_id = leads.id)`,
      proformaCount: sql<number>`(select count(*)::int from proformas pf where pf.lead_id = leads.id)`,
      hasActiveProforma: sql<boolean>`exists (select 1 from proformas pa where pa.lead_id = leads.id and pa.status = 'active' and pa.valid_until > now())`,
    })
    .from(leads)
    .where(
      and(
        inArray(leads.contactMobile, mobileMatchVariants(subject.contactMobile)),
        ne(leads.id, subject.id),
        isNull(leads.deletedAt),
        gte(leads.createdAt, from),
        lte(leads.createdAt, to),
      ),
    )
    .orderBy(desc(leads.createdAt))
    .limit(20);

  const subjectActive = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(proformas)
    .where(and(eq(proformas.leadId, subject.id), eq(proformas.status, 'active'), gt(proformas.validUntil, new Date())));

  return {
    windowDays: withinDays,
    subjectHasActiveProforma: Number(subjectActive[0]?.n ?? 0) > 0,
    // The SQL `IN (…)` above is only a pre-filter; the normalised key on both
    // sides is what actually decides. Never trust the widening filter.
    candidates: rows
      .filter((r) => normalizedMobileKey(r.contactMobile) === subjectKey)
      // `contactMobile` is deliberately NOT re-exported: the alert already
      // shows the number once, on the lead the rep is looking at.
      .map((r) => ({
        id: r.id,
        ref: r.ref,
        status: r.status,
        assigneeId: r.assigneeId,
        contactName: r.contactName,
        createdAt: r.createdAt,
        itemCount: Number(r.itemCount),
        noteCount: Number(r.noteCount),
        proformaCount: Number(r.proformaCount),
        hasActiveProforma: Boolean(r.hasActiveProforma),
      })),
  };
}

/** Refused: a lead cannot be merged into itself. */
export class LeadMergeSelfError extends Error {
  constructor() {
    super('cannot merge a lead into itself');
  }
}

/** Refused: one side is missing or already archived (soft-deleted). */
export class LeadMergeMissingError extends Error {
  readonly side: 'winner' | 'loser';
  constructor(side: 'winner' | 'loser') {
    super(`merge ${side} lead not found or already archived`);
    this.side = side;
  }
}

/** Refused: the two leads are not the same customer. Re-checked SERVER-side
 *  from the two locked rows — never trusted from the client, which only ever
 *  sends ids. */
export class LeadMergeMobileMismatchError extends Error {
  constructor() {
    super('leads do not share a normalised contact mobile');
  }
}

/**
 * Refused: an ACTIVE proforma exists on one of the two leads.
 *
 * This is a hard precondition, not a warning. `issueProforma` maintains the
 * invariant "exactly one active proforma per lead" via `supersedeActiveProformas`,
 * and `updateLeadItem` throws `LeadItemLockedError` when an active proforma
 * exists so line items cannot drift under an issued quote. Re-parenting a
 * proforma row would leave the survivor with TWO active proformas — silently
 * breaking an invariant the item-edit lock, the expiry sweep and the public
 * `/proforma/{ref}` page all depend on. We never auto-supersede: the customer
 * may be holding that quote right now.
 */
export class LeadMergeProformaActiveError extends Error {
  readonly side: 'winner' | 'loser';
  readonly proformaRef: string;
  constructor(side: 'winner' | 'loser', proformaRef: string) {
    super(`lead ${side} has an active proforma ${proformaRef}`);
    this.side = side;
    this.proformaRef = proformaRef;
  }
}

export interface LeadMergeResult {
  winner: LeadRow;
  loser: LeadRow;
  /** Everything a human needs to reverse this merge BY HAND — the route puts
   *  it in both audit entries' `before` payload. */
  movedItemIds: string[];
  movedNoteIds: string[];
  movedProformaIds: string[];
  movedRequestIds: string[];
}

/**
 * Fold `loserId` into `winnerId`. THE ONLY IRREVERSIBLE OPERATION IN THE ADMIN
 * PANEL — there is no undo button, so every step below is a refusal looking for
 * a reason.
 *
 * One transaction, in this order:
 *   1. lock BOTH lead rows FOR UPDATE, ascending by id (deadlock avoidance —
 *      two reps merging the same pair in opposite directions would otherwise
 *      each hold the row the other needs)
 *   2. refuse a self-merge
 *   3. refuse unless BOTH rows exist and BOTH have deletedAt IS NULL
 *   4. refuse unless the NORMALISED mobiles are equal (server-side, from the
 *      locked rows)
 *   5. refuse if EITHER side has an active proforma (see the error class)
 *   6. move lead_items (offsetting `order` past the winner's max so the two
 *      sequences don't interleave into an arbitrary display order)
 *   7. move lead_notes
 *   8. move proformas
 *   9. move user_requests.leadId
 *  10. soft-delete the loser
 *
 * SOFT-delete, never hard: `lead_items`, `lead_notes` and `proformas` are all
 * `onDelete: 'cascade'`, so a DELETE would destroy historical proformas whose
 * `ref` a customer may still hold an SMS link to — 404-ing a document already
 * sent. `leads.deletedAt` exists precisely for this; its schema comment names
 * "duplicate" explicitly.
 *
 * `user_requests.leadId` is `ON DELETE SET NULL`, but we soft-delete, so that
 * FK action never fires. Step 9's explicit UPDATE is what actually moves the
 * customer's `/account/requests` row onto the surviving lead.
 *
 * Deliberately NOT merged: `assigneeId`, `status`, `callbackAt`, `context`.
 * The winner keeps its own — silent reassignment takes a lead off someone's
 * desk without telling them. The confirm dialog names the loser's assignee
 * instead. The only write to the winner's own columns is an append of the
 * loser's ref to `context.mergedFrom`.
 */
export async function mergeLeads(winnerId: string, loserId: string, actorId: string): Promise<LeadMergeResult> {
  return getDb().transaction(async (tx) => {
    // 1 — lock both rows, ascending id order. Two statements rather than one
    // `IN (…) ORDER BY id FOR UPDATE`, so the lock order is the statement
    // order and does not depend on how the planner happens to place LockRows.
    const lockOrder = [...new Set([winnerId, loserId])].sort();
    const locked = new Map<string, LeadRow>();
    for (const id of lockOrder) {
      const rows = await tx.select().from(leads).where(eq(leads.id, id)).limit(1).for('update');
      if (rows[0]) locked.set(id, rows[0]);
    }

    // 2 — self-merge
    if (winnerId === loserId) throw new LeadMergeSelfError();

    // 3 — both present, neither archived
    const winner = locked.get(winnerId);
    const loser = locked.get(loserId);
    if (!winner || winner.deletedAt !== null) throw new LeadMergeMissingError('winner');
    if (!loser || loser.deletedAt !== null) throw new LeadMergeMissingError('loser');

    // 4 — same customer, decided from the locked rows
    if (normalizedMobileKey(winner.contactMobile) !== normalizedMobileKey(loser.contactMobile)) {
      throw new LeadMergeMobileMismatchError();
    }

    // 5 — no active proforma on EITHER side. `validUntil > now()` as well as
    // status='active', mirroring updateLeadItem: the expiry sweep runs every
    // 10 minutes, so a lapsed quote can still read 'active' for a while and
    // must not block a merge the customer can no longer act on.
    const blocking = await tx
      .select({ leadId: proformas.leadId, ref: proformas.ref })
      .from(proformas)
      .where(
        and(
          inArray(proformas.leadId, [winnerId, loserId]),
          eq(proformas.status, 'active'),
          gt(proformas.validUntil, new Date()),
        ),
      )
      .orderBy(desc(proformas.createdAt))
      .limit(1);
    if (blocking[0]) {
      throw new LeadMergeProformaActiveError(blocking[0].leadId === winnerId ? 'winner' : 'loser', blocking[0].ref);
    }

    // 6 — items. Offset past the winner's highest `order` so the survivor's
    // lines read as "the winner's list, then the loser's", not two interleaved
    // sequences both starting at 0.
    const maxOrder = await tx
      .select({ m: sql<number | null>`max(${leadItems.order})` })
      .from(leadItems)
      .where(eq(leadItems.leadId, winnerId));
    const offset = (maxOrder[0]?.m ?? -1) + 1;
    const movedItems = await tx
      .update(leadItems)
      .set({ leadId: winnerId, order: sql`${leadItems.order} + ${offset}` })
      .where(eq(leadItems.leadId, loserId))
      .returning({ id: leadItems.id });

    // 7 — notes
    const movedNotes = await tx
      .update(leadNotes)
      .set({ leadId: winnerId })
      .where(eq(leadNotes.leadId, loserId))
      .returning({ id: leadNotes.id });

    // 8 — proformas (all expired/cancelled by guard 5; the customer's SMS
    // links keep resolving because the rows themselves are never deleted)
    const movedProformas = await tx
      .update(proformas)
      .set({ leadId: winnerId })
      .where(eq(proformas.leadId, loserId))
      .returning({ id: proformas.id });

    // 9 — the customer's own «درخواست‌های من» rows
    const movedRequests = await tx
      .update(userRequests)
      .set({ leadId: winnerId, updatedAt: new Date() })
      .where(eq(userRequests.leadId, loserId))
      .returning({ id: userRequests.id });

    // 10 — archive the loser. NOT a DELETE: see the function doc.
    const now = new Date();
    const loserRows = await tx
      .update(leads)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(leads.id, loserId), isNull(leads.deletedAt)))
      .returning();
    const archivedLoser = loserRows[0];
    // Unreachable while the row is held FOR UPDATE — but a merge that silently
    // left the duplicate alive after moving its children is the one outcome
    // worse than refusing, so it aborts the whole transaction rather than
    // trusting the lock.
    if (!archivedLoser) throw new LeadMergeMissingError('loser');

    const prevMergedFrom = Array.isArray(winner.context?.mergedFrom)
      ? (winner.context.mergedFrom as unknown[]).filter((v): v is string => typeof v === 'string')
      : [];
    const winnerRows = await tx
      .update(leads)
      .set({
        context: { ...(winner.context ?? {}), mergedFrom: [...prevMergedFrom, loser.ref] },
        updatedAt: now,
      })
      .where(eq(leads.id, winnerId))
      .returning();

    // The rep who opens the survivor tomorrow has to be able to see why it
    // suddenly has six line items. Inserted AFTER the note move, so it is not
    // itself part of `movedNoteIds`, and inside the transaction so a rollback
    // takes it with everything else.
    await tx.insert(leadNotes).values({
      id: ulid(),
      leadId: winnerId,
      authorId: actorId,
      text:
        `سرنخ ${loser.ref} به‌عنوان تکراری در این سرنخ ادغام شد — ` +
        `${toPersianDigits(movedItems.length)} قلم کالا، ${toPersianDigits(movedNotes.length)} یادداشت و ` +
        `${toPersianDigits(movedProformas.length)} پیش‌فاکتور منتقل شد.`,
    });

    return {
      winner: winnerRows[0] ?? winner,
      loser: archivedLoser,
      movedItemIds: movedItems.map((r) => r.id),
      movedNoteIds: movedNotes.map((r) => r.id),
      movedProformaIds: movedProformas.map((r) => r.id),
      movedRequestIds: movedRequests.map((r) => r.id),
    };
  });
}

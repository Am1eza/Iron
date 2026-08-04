/**
 * The conversion spine — Lead → Proforma (پیش‌فاکتور) plus the per-user
 * requests inbox and contact messages. Proforma lines are a frozen jsonb
 * snapshot so later price changes never drift an issued quote.
 */
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { PRICE_UNITS, skus } from './catalog';
import { NOTIFY_CHANNELS } from './engagement';
import type { LineItem } from '@/lib/types/domain';

export const LEAD_SOURCES = ['table', 'ai', 'cart', 'cooperation', 'tool', 'warehouse', 'contact'] as const;
export const LEAD_STATUSES = ['new', 'contacted', 'won', 'lost'] as const;
export const COOPERATION_TYPES = ['market-analysis', 'supply', 'sell'] as const;
export const REQUEST_TYPES = ['proforma', 'bulk', 'warehouse'] as const;
// 'fulfilled' (W20) — the terminal state for a request that was resolved by
// something OTHER than issuing a پیش‌فاکتور (a warehouse request being
// stored is the first case; 'quoted' could never legitimately describe it).
export const REQUEST_STATUSES = ['submitted', 'reviewing', 'contacted', 'quoted', 'fulfilled'] as const;

export interface LeadContext {
  aiConversationId?: string;
  sourcePage?: string;
  estimate?: { totalWeightKg?: number; totalPrice?: number };
  /** AI-advisor chat that led to this lead (capped upstream) — sales context. */
  transcript?: Array<{ role: string; content: string }>;
  /** Set by createWarehouseRequest (W20) — what the customer actually asked
   *  to store, read back by requestsRepo.pendingWarehouseRequests() so the
   *  admin intake queue can prefill a real value instead of a rep re-typing
   *  it from the request's free-text title. */
  warehouse?: { product: string; quantityTons: number; duration: string };
  [key: string]: unknown;
}

export const leads = pgTable(
  'leads',
  {
    id: text('id').primaryKey(),
    ref: text('ref').notNull().unique(),
    // Leads are real business records — a deleted user/staff account must
    // not take the lead down with it, just detach from it.
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    contactName: text('contact_name'),
    contactMobile: text('contact_mobile').notNull(),
    contactVerified: boolean('contact_verified').notNull().default(false),
    source: text('source', { enum: LEAD_SOURCES }).notNull(),
    cooperationType: text('cooperation_type', { enum: COOPERATION_TYPES }),
    context: jsonb('context').$type<LeadContext>(),
    channelPref: text('channel_pref', { enum: NOTIFY_CHANNELS }).notNull().default('sms'),
    status: text('status', { enum: LEAD_STATUSES }).notNull().default('new'),
    assigneeId: text('assignee_id').references(() => users.id, { onDelete: 'set null' }),
    callbackAt: timestamp('callback_at', { withTimezone: true }),
    // FIRST-TOUCH marketing attribution (W28). Deliberately NOT the same
    // thing as `source` above: `source` is which widget on our own site
    // created the lead ('table', 'cart', 'ai', …) and says nothing about
    // where the visitor came from — a Google search, an Instagram ad and a
    // direct visit all collapse into 'table'. Without these columns the
    // owner cannot answer "did the money I spent on that campaign produce a
    // won deal", which is the one question a marketing dashboard exists for.
    // Nullable throughout: direct traffic, and every lead created before
    // this migration, legitimately has no campaign.
    utmSource: text('utm_source'),
    utmMedium: text('utm_medium'),
    utmCampaign: text('utm_campaign'),
    /** `document.referrer` at landing — covers the common untagged inbound
     *  link that carries no UTM at all. */
    landingReferrer: text('landing_referrer'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    // Soft-delete (archive a spam/duplicate/test lead out of admin views
    // without losing its audit trail) — deliberately separate from `status`:
    // 'lost' means a real lead that didn't convert, this means "shouldn't
    // have existed in the working set at all". Null = active (the default,
    // and every existing row after migration).
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('leads_status_assignee_created_idx').on(t.status, t.assigneeId, t.createdAt),
    // The rep desk (/admin/desk, polled every 60s per logged-in rep) always
    // starts from "MY leads": assignee_id = ? … GROUP BY status, and the
    // active queue assignee_id = ? AND status IN ('new','contacted') ORDER BY
    // created_at DESC. The status-first index above cannot serve either —
    // Postgres can't skip a leading column — so both were seq-scanning the
    // whole leads table. Assignee-first, with status/created_at trailing so
    // the queue gets its ordering for free.
    index('leads_assignee_status_created_idx').on(t.assigneeId, t.status, t.createdAt),
    // Callback queue: assignee_id = ? AND status IN (open) AND callback_at
    // ≷ now() ORDER BY callback_at. PARTIAL on `callback_at is not null`
    // because only the small minority of leads with a scheduled call are ever
    // read here — the index stays a fraction of the table's size.
    // The predicate is written unqualified on purpose: Postgres rejects a
    // table-qualified column reference inside a CREATE INDEX … WHERE clause,
    // and `sql`${t.callbackAt}`` interpolates as "leads"."callback_at".
    index('leads_assignee_callback_idx')
      .on(t.assigneeId, t.callbackAt)
      .where(sql`callback_at is not null`),
    index('leads_user_idx').on(t.userId),
    index('leads_contact_mobile_idx').on(t.contactMobile),
    // The campaign report groups by utm_campaign over a date window; PARTIAL
    // because only tagged traffic is ever read here, so the index stays a
    // small fraction of the table (most leads are direct/untagged).
    index('leads_utm_campaign_created_idx')
      .on(t.utmCampaign, t.createdAt)
      .where(sql`utm_campaign is not null`),
    // Every marketing/dashboard aggregate windows on created_at alone; none
    // of the composite indexes above can serve that (Postgres cannot skip a
    // leading column), so they were all seq-scanning the leads table.
    index('leads_created_idx').on(t.createdAt),
  ],
);

export const leadItems = pgTable(
  'lead_items',
  {
    id: text('id').primaryKey(),
    // Structural child of the lead — goes with it.
    leadId: text('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    // The line item snapshots name/qty/price already — the sku link is a
    // cross-reference, not required for the record's own integrity, so a
    // deleted product must not erase real order/lead history.
    skuId: text('sku_id').references(() => skus.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    qty: doublePrecision('qty').notNull(),
    unit: text('unit', { enum: PRICE_UNITS }).notNull(),
    weightKg: doublePrecision('weight_kg'),
    unitPrice: bigint('unit_price', { mode: 'number' }),
    lineTotal: bigint('line_total', { mode: 'number' }),
    order: integer('order').notNull().default(0),
  },
  (t) => [
    index('lead_items_lead_idx').on(t.leadId),
    // FK with no covering index (W29) — the `skus` ON DELETE SET NULL.
    index('lead_items_sku_idx').on(t.skuId),
  ],
);

export const leadNotes = pgTable(
  'lead_notes',
  {
    id: text('id').primaryKey(),
    leadId: text('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    // `authorId` intentionally has NO onDelete override: it's required
    // (a note must have a writer) and notes are real sales history — the
    // Postgres default (RESTRICT) blocks deleting a staff account that has
    // authored notes rather than silently cascading the loss or leaving a
    // dangling reference. Deactivate the account (users.isActive) instead.
    authorId: text('author_id')
      .notNull()
      .references(() => users.id),
    text: text('text').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('lead_notes_lead_idx').on(t.leadId),
    // FK with no covering index (W29). This one is RESTRICT, so the scan runs
    // on every attempt to delete a staff account, not just successful ones.
    index('lead_notes_author_idx').on(t.authorId),
  ],
);

export const proformas = pgTable(
  'proformas',
  {
    id: text('id').primaryKey(),
    // Structural child of the lead (frozen line-item snapshot) — goes with it.
    leadId: text('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    ref: text('ref').notNull().unique(),
    lines: jsonb('lines').$type<LineItem[]>().notNull(),
    subtotal: bigint('subtotal', { mode: 'number' }).notNull(),
    // Flat Toman amount off `subtotal`, applied BEFORE VAT (US-19.4). Kept
    // separate from `subtotal` (which stays the raw, undiscounted line-item
    // sum) so the proforma stays auditable — an admin/customer can see both
    // the original total and what was taken off, not just the net result.
    discountToman: bigint('discount_toman', { mode: 'number' }).notNull().default(0),
    vatRate: doublePrecision('vat_rate').notNull(),
    vatAmount: bigint('vat_amount', { mode: 'number' }).notNull(),
    total: bigint('total', { mode: 'number' }).notNull(),
    validUntil: timestamp('valid_until', { withTimezone: true }).notNull(),
    // 'cancelled' — an admin voiding an issued proforma (customer changed the
    // order, a pricing error, etc.), distinct from the automatic time-based
    // 'expired' the sweep job sets. Adding it is safe: expireDueProformas()
    // only ever touches rows WHERE status='active', so a cancelled row is
    // never picked up or overwritten by it.
    status: text('status', { enum: ['active', 'expired', 'cancelled'] }).notNull().default('active'),
    pdfUrl: text('pdf_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('proformas_lead_idx').on(t.leadId),
    // Hot path for the proforma-expiry sweep job (WHERE status='active' AND
    // valid_until < now()), run every 10 minutes and growing with every
    // issued proforma — was previously unindexed.
    index('proformas_status_valid_idx').on(t.status, t.validUntil),
    // The analytics dashboard windows proforma count AND summed value on
    // `created_at` alone (analyticsRepo overviewStats/proformaValue); neither
    // index above is prefixed by it (W29).
    index('proformas_created_idx').on(t.createdAt),
  ],
);

/** Atomic per-scope sequence for human refs (PF-14050410-0021, RQ-…, OR-…). */
export const refCounters = pgTable('ref_counters', {
  scope: text('scope').primaryKey(),
  seq: integer('seq').notNull().default(0),
});

/** Server home of the account «درخواست‌های من» inbox (was localStorage-only). */
export const userRequests = pgTable(
  'user_requests',
  {
    id: text('id').primaryKey(),
    // `ref` is scoped unique PER USER (W20), not globally: the localStorage→
    // server import path lets the CLIENT propose a ref (see requestsRepo.ts's
    // insertRequest onConflictDoNothing), and a global unique constraint made
    // two different customers' locally-minted refs collide — the second
    // customer's request was silently dropped on import. Per-user scoping
    // means one customer can never block another's, at the schema level, not
    // just by convention.
    ref: text('ref').notNull(),
    // `userId` intentionally has NO onDelete override — same reasoning as
    // lead_notes.authorId: required, and a submitted request is real
    // customer history the app must not silently discard or orphan.
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    type: text('type', { enum: REQUEST_TYPES }).notNull(),
    title: text('title').notNull(),
    detail: text('detail'),
    note: text('note'),
    status: text('status', { enum: REQUEST_STATUSES }).notNull().default('submitted'),
    leadId: text('lead_id').references(() => leads.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('user_requests_user_created_idx').on(t.userId, t.createdAt),
    uniqueIndex('user_requests_user_ref_uq').on(t.userId, t.ref),
    // FK with no covering index (W29) — the `leads` ON DELETE SET NULL.
    index('user_requests_lead_idx').on(t.leadId),
    // The ADMIN requests list orders by `created_at DESC` across ALL users
    // (requestsRepo:130) — the user-first composite above cannot serve it.
    index('user_requests_created_idx').on(t.createdAt),
  ],
);

export const contactMessages = pgTable(
  'contact_messages',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    mobile: text('mobile').notNull(),
    message: text('message').notNull(),
    status: text('status', { enum: ['new', 'handled'] }).notNull().default('new'),
    // Reply-in-place (US-19.5) — sent to the customer's mobile via SMS; both
    // null until a staff member actually replies.
    reply: text('reply'),
    repliedAt: timestamp('replied_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // The admin inbox is a single `ORDER BY created_at DESC` list and this table
  // had no index at all beyond its pkey (W29).
  (t) => [index('contact_messages_created_idx').on(t.createdAt)],
);

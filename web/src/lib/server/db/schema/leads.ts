/**
 * The conversion spine — Lead → Proforma (پیش‌فاکتور) plus the per-user
 * requests inbox and contact messages. Proforma lines are a frozen jsonb
 * snapshot so later price changes never drift an issued quote.
 */
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
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { PRICE_UNITS, skus } from './catalog';
import { NOTIFY_CHANNELS } from './engagement';
import type { LineItem } from '@/lib/types/domain';

export const LEAD_SOURCES = ['table', 'ai', 'cart', 'cooperation', 'tool', 'warehouse', 'contact'] as const;
export const LEAD_STATUSES = ['new', 'contacted', 'won', 'lost'] as const;
export const COOPERATION_TYPES = ['market-analysis', 'supply', 'sell'] as const;
export const REQUEST_TYPES = ['proforma', 'bulk', 'warehouse'] as const;
export const REQUEST_STATUSES = ['submitted', 'reviewing', 'contacted', 'quoted'] as const;

export interface LeadContext {
  aiConversationId?: string;
  sourcePage?: string;
  estimate?: { totalWeightKg?: number; totalPrice?: number };
  /** AI-advisor chat that led to this lead (capped upstream) — sales context. */
  transcript?: Array<{ role: string; content: string }>;
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
    index('leads_user_idx').on(t.userId),
    index('leads_contact_mobile_idx').on(t.contactMobile),
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
  (t) => [index('lead_items_lead_idx').on(t.leadId)],
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
  (t) => [index('lead_notes_lead_idx').on(t.leadId)],
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
    ref: text('ref').notNull().unique(),
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
  (t) => [index('user_requests_user_created_idx').on(t.userId, t.createdAt)],
);

export const contactMessages = pgTable('contact_messages', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  mobile: text('mobile').notNull(),
  message: text('message').notNull(),
  status: text('status', { enum: ['new', 'handled'] }).notNull().default('new'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

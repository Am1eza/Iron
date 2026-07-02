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
  [key: string]: unknown;
}

export const leads = pgTable(
  'leads',
  {
    id: text('id').primaryKey(),
    ref: text('ref').notNull().unique(),
    userId: text('user_id').references(() => users.id),
    contactName: text('contact_name'),
    contactMobile: text('contact_mobile').notNull(),
    contactVerified: boolean('contact_verified').notNull().default(false),
    source: text('source', { enum: LEAD_SOURCES }).notNull(),
    cooperationType: text('cooperation_type', { enum: COOPERATION_TYPES }),
    context: jsonb('context').$type<LeadContext>(),
    channelPref: text('channel_pref', { enum: NOTIFY_CHANNELS }).notNull().default('sms'),
    status: text('status', { enum: LEAD_STATUSES }).notNull().default('new'),
    assigneeId: text('assignee_id').references(() => users.id),
    callbackAt: timestamp('callback_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
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
    leadId: text('lead_id')
      .notNull()
      .references(() => leads.id),
    skuId: text('sku_id').references(() => skus.id),
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
      .references(() => leads.id),
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
    leadId: text('lead_id')
      .notNull()
      .references(() => leads.id),
    ref: text('ref').notNull().unique(),
    lines: jsonb('lines').$type<LineItem[]>().notNull(),
    subtotal: bigint('subtotal', { mode: 'number' }).notNull(),
    vatRate: doublePrecision('vat_rate').notNull(),
    vatAmount: bigint('vat_amount', { mode: 'number' }).notNull(),
    total: bigint('total', { mode: 'number' }).notNull(),
    validUntil: timestamp('valid_until', { withTimezone: true }).notNull(),
    status: text('status', { enum: ['active', 'expired'] }).notNull().default('active'),
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
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    type: text('type', { enum: REQUEST_TYPES }).notNull(),
    title: text('title').notNull(),
    detail: text('detail'),
    note: text('note'),
    status: text('status', { enum: REQUEST_STATUSES }).notNull().default('submitted'),
    leadId: text('lead_id').references(() => leads.id),
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

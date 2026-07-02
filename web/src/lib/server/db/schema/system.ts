/**
 * System — audit log (every admin write), kv settings, and the SMS delivery
 * log (also how dev-mode SMS stays visible without a provider key).
 */
import { index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from './auth';

export const auditEntries = pgTable(
  'audit_entries',
  {
    id: text('id').primaryKey(),
    actorId: text('actor_id').references(() => users.id), // null = system job
    action: text('action').notNull(), // "price.update" | "lead.status" | ...
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    before: jsonb('before'),
    after: jsonb('after'),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_entries_entity_idx').on(t.entityType, t.entityId),
    index('audit_entries_actor_at_idx').on(t.actorId, t.at),
  ],
);

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const SMS_KINDS = ['otp', 'proforma', 'alert', 'generic'] as const;
export const SMS_STATUSES = ['sent', 'failed', 'dev_logged'] as const;

export const smsLog = pgTable(
  'sms_log',
  {
    id: text('id').primaryKey(),
    to: text('to').notNull(),
    kind: text('kind', { enum: SMS_KINDS }).notNull(),
    payload: jsonb('payload'),
    status: text('status', { enum: SMS_STATUSES }).notNull(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('sms_log_to_idx').on(t.to)],
);

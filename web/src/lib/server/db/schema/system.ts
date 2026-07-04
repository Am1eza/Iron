/**
 * System — audit log (every admin write), kv settings, the SMS delivery
 * log (also how dev-mode SMS stays visible without a provider key), and the
 * AI-advisor usage log (per-request token cost + grounding violations).
 */
import { index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from './auth';

export const auditEntries = pgTable(
  'audit_entries',
  {
    id: text('id').primaryKey(),
    // The audit trail must survive even a deleted actor's account — set
    // null (keep the entry), never cascade (never lose the record).
    actorId: text('actor_id').references(() => users.id, { onDelete: 'set null' }), // null = system job
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
    // Backs the keyset-pagination `WHERE (at, id) < (cursorAt, cursorId)
    // ORDER BY at DESC, id DESC` in auditRepo.listAudit — also covers the
    // unfiltered "list everything, newest first" admin default, which
    // neither index above serves (both are prefixed by a specific
    // entity/actor). An append-only, ever-growing table with no index on
    // its own ordering column was doing a full scan + sort on every load.
    index('audit_entries_at_id_idx').on(t.at, t.id),
  ],
);

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const SMS_KINDS = ['otp', 'proforma', 'alert', 'generic'] as const;
export const SMS_STATUSES = ['sent', 'failed', 'dev_logged'] as const;

/** One AI-advisor conversation — anchors persisted turns and the rolling
 *  Persian summary that keeps long chats cheap (older turns collapse into
 *  `summary` instead of riding the prompt forever). `userId` stays nullable:
 *  the advisor is deliberately open to anonymous visitors. */
export const aiConversations = pgTable(
  'ai_conversations',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    summary: text('summary'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ai_conversations_user_idx').on(t.userId)],
);

/** One persisted chat turn (user or assistant — only the SANITIZED assistant
 *  text is ever stored, the same text the visitor saw). */
export const aiMessages = pgTable(
  'ai_messages',
  {
    id: text('id').primaryKey(),
    // Structural child of the conversation — goes with it.
    conversationId: text('conversation_id')
      .notNull()
      .references(() => aiConversations.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['user', 'assistant'] }).notNull(),
    content: text('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ai_messages_conversation_idx').on(t.conversationId, t.createdAt)],
);

/** One row per /api/ai/chat request — DeepSeek token cost (summed across all
 *  completion rounds) plus how many grounding violations the validator cut. */
export const aiUsage = pgTable(
  'ai_usage',
  {
    id: text('id').primaryKey(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    conversationId: text('conversation_id'),
    promptTokens: integer('prompt_tokens').notNull().default(0),
    completionTokens: integer('completion_tokens').notNull().default(0),
    cacheHitTokens: integer('cache_hit_tokens').notNull().default(0),
    violations: integer('violations').notNull().default(0),
  },
  (t) => [index('ai_usage_created_idx').on(t.createdAt)],
);

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

/** Idempotency-Key support (Stripe/IETF-style header convention) for
 *  financially-meaningful writes — پیش‌فاکتور/سفارش issuance — so a client
 *  retry (network blip, admin double-click, duplicate webhook) can't create
 *  a second proforma/order/SMS. See lib/server/utils/idempotency.ts. */
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    key: text('key').primaryKey(), // `${route}:${client-or-fallback key}`
    route: text('route').notNull(),
    status: text('status', { enum: ['pending', 'done'] }).notNull().default('pending'),
    responseStatus: integer('response_status'),
    responseBody: jsonb('response_body'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idempotency_keys_created_idx').on(t.createdAt)],
);

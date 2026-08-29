/**
 * A signed-in visitor's own advisor conversations.
 *
 * WHY THIS IS NEW. Every turn has always been persisted (`ai_conversations` +
 * `ai_messages`), and an admin could already read a thread through
 * `aiReviewRepo.conversationThread` — but the CUSTOMER had no way back to
 * their own. The only control was «گفتگوی جدید», which starts one. That was a
 * small gap while the advisor was stateless; it stopped being small once a
 * conversation began carrying real state (the product, size, city and tonnage
 * it has established) and a returning customer's own order history.
 *
 * NO SCHEMA CHANGE. `ai_conversations` already has `user_id` (indexed),
 * `summary` and `updated_at`, and `ai_messages` is indexed on
 * (conversation_id, created_at). Everything below is a read.
 *
 * TITLES ARE DERIVED, NOT STORED. A `title` column would need a migration, a
 * backfill for every existing row, and a decision about when to regenerate it.
 * The two things that actually make a good title are already here: the
 * advisor's own rolling summary, and the visitor's first message. Deriving
 * from those is free, works for every historical row, and cannot go stale.
 */
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/lib/server/db/client';
import { aiConversations, aiMessages } from '@/lib/server/db/schema';

/** Enough to cover months of real use without becoming a paginated surface of
 *  its own; the rail shows them all and scrolls. */
export const CONVERSATION_LIST_LIMIT = 50;

/** Titles are one line in a 260px rail — past this they are an ellipsis. */
const TITLE_MAX_CHARS = 60;

export interface ConversationSummary {
  id: string;
  /** Derived — see `conversationTitle`. Never empty. */
  title: string;
  /** ISO; the last turn, not the first — the rail sorts by recency. */
  updatedAt: string;
  messageCount: number;
}

/**
 * The name a visitor will recognise the conversation by.
 *
 * The FIRST USER MESSAGE wins over the model's rolling summary, which is the
 * opposite of what seems obvious and is deliberate. The summary is written to
 * be a briefing for the model («کاربر به دنبال میلگرد آجدار برای اسکلت است و
 * شهر تحویل را مشهد اعلام کرده») — accurate, and nothing like what the person
 * typed. People find their own conversation by remembering what they ASKED.
 * The summary is the fallback for a thread whose first message did not survive
 * (an empty answer is deliberately not persisted, so a first turn can be
 * assistant-only).
 */
export function conversationTitle(firstUserMessage?: string | null, summary?: string | null): string {
  const source = firstUserMessage?.trim() || summary?.trim();
  if (!source) return 'گفتگوی بدون عنوان';
  // Collapse newlines: a pasted cut list would otherwise become a title with
  // line breaks in a single-line row.
  const flat = source.replace(/\s+/g, ' ').trim();
  return flat.length > TITLE_MAX_CHARS ? `${flat.slice(0, TITLE_MAX_CHARS).trimEnd()}…` : flat;
}

/**
 * This user's conversations, newest activity first.
 *
 * Scoped by `userId` at the query, never filtered afterwards — the same rule
 * `ensureConversation` already applies. An anonymous visitor has no list: their
 * conversations are stored with a null `user_id` and are reachable only from
 * the browser that created them (localStorage), which is the correct privacy
 * behaviour for a shared device.
 *
 * Three queries rather than one join: the per-conversation first message and
 * message count are both aggregates over `ai_messages`, and doing them as a
 * lateral join produced a plan that scanned the whole table for a user with
 * many threads. `inArray` over at most `CONVERSATION_LIST_LIMIT` ids uses the
 * (conversation_id, created_at) index directly.
 */
export async function listConversationsForUser(
  userId: string,
  limit = CONVERSATION_LIST_LIMIT,
): Promise<ConversationSummary[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: aiConversations.id,
      summary: aiConversations.summary,
      updatedAt: aiConversations.updatedAt,
    })
    .from(aiConversations)
    .where(eq(aiConversations.userId, userId))
    .orderBy(desc(aiConversations.updatedAt))
    .limit(Math.min(Math.max(limit, 1), CONVERSATION_LIST_LIMIT));
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const counts = await db
    .select({ conversationId: aiMessages.conversationId, n: sql<number>`count(*)::int` })
    .from(aiMessages)
    .where(inArray(aiMessages.conversationId, ids))
    .groupBy(aiMessages.conversationId);
  const countBy = new Map(counts.map((c) => [c.conversationId, c.n]));

  // DISTINCT ON gives the earliest USER message per conversation in one pass.
  const firsts = await db
    .selectDistinctOn([aiMessages.conversationId], {
      conversationId: aiMessages.conversationId,
      content: aiMessages.content,
    })
    .from(aiMessages)
    .where(and(inArray(aiMessages.conversationId, ids), eq(aiMessages.role, 'user')))
    .orderBy(aiMessages.conversationId, aiMessages.createdAt);
  const firstBy = new Map(firsts.map((f) => [f.conversationId, f.content]));

  return (
    rows
      .map((r) => ({
        id: r.id,
        title: conversationTitle(firstBy.get(r.id), r.summary),
        updatedAt: r.updatedAt.toISOString(),
        messageCount: countBy.get(r.id) ?? 0,
      }))
      // A row with no messages is a conversation that was created and then
      // abandoned before its first turn persisted (or whose only turn was an
      // answer the pipeline threw away). It has nothing to return to.
      .filter((c) => c.messageCount > 0)
  );
}

/**
 * One conversation's turns, oldest first — for reopening it in the client.
 *
 * Returns null when the id is not this user's, deliberately not an empty
 * array: a conversation id is echoed to the client and persists in a browser,
 * so "not yours" and "yours but empty" must not look the same to the caller.
 */
export async function conversationForUser(
  conversationId: string,
  userId: string,
): Promise<{ id: string; title: string; messages: Array<{ id: string; role: 'user' | 'assistant'; content: string; createdAt: string }> } | null> {
  const db = getDb();
  const [conv] = await db
    .select({ id: aiConversations.id, summary: aiConversations.summary })
    .from(aiConversations)
    .where(and(eq(aiConversations.id, conversationId), eq(aiConversations.userId, userId)))
    .limit(1);
  if (!conv) return null;

  const rows = await db
    .select({
      id: aiMessages.id,
      role: aiMessages.role,
      content: aiMessages.content,
      createdAt: aiMessages.createdAt,
    })
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, conversationId))
    .orderBy(aiMessages.createdAt);

  return {
    id: conv.id,
    title: conversationTitle(
      rows.find((r) => r.role === 'user')?.content,
      conv.summary,
    ),
    messages: rows.map((r) => ({
      id: r.id,
      role: r.role,
      content: r.content,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

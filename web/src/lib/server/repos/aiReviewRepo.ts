/** AI advisor review — feedback (👍/👎) joined with its answer + surrounding
 *  conversation, for the admin review page (continuous-improvement loop). */
import { and, asc, desc, eq, lt, or, sql } from 'drizzle-orm';
import { getDb } from '@/lib/server/db/client';
import { aiFeedback, aiMessages, aiConversations } from '@/lib/server/db/schema';

export type AiFeedbackRow = {
  id: string;
  rating: 'up' | 'down';
  reason: string | null;
  createdAt: Date;
  conversationId: string | null;
  messageId: string | null;
  /** The flagged answer's own text, when it still resolves to a real message. */
  answerText: string | null;
};

function encodeCursor(row: Pick<AiFeedbackRow, 'createdAt' | 'id'>): string {
  return Buffer.from(`${row.createdAt.getTime()}_${row.id}`).toString('base64url');
}

function decodeCursor(cursor: string): { at: Date; id: string } | null {
  try {
    const [ms, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('_');
    if (!ms || !id) return null;
    const at = new Date(Number(ms));
    if (Number.isNaN(at.getTime())) return null;
    return { at, id };
  } catch {
    return null;
  }
}

/** Keyset-paginated feedback list, newest first — same pattern as auditRepo
 *  (append-only, only ever grows: OFFSET would get slower on every later page). */
export async function listAiFeedback(query: {
  rating?: 'up' | 'down';
  cursor?: string;
  limit?: number;
}): Promise<{ entries: AiFeedbackRow[]; nextCursor: string | null }> {
  const db = getDb();
  const limit = Math.min(Math.max(query.limit ?? 30, 1), 100);
  const conds = [];
  if (query.rating) conds.push(eq(aiFeedback.rating, query.rating));
  const cursor = query.cursor ? decodeCursor(query.cursor) : null;
  if (cursor) {
    conds.push(
      or(
        lt(aiFeedback.createdAt, cursor.at),
        and(eq(aiFeedback.createdAt, cursor.at), lt(aiFeedback.id, cursor.id)),
      ),
    );
  }
  const where = conds.length ? and(...conds) : undefined;
  const rows = await db
    .select({
      id: aiFeedback.id,
      rating: aiFeedback.rating,
      reason: aiFeedback.reason,
      createdAt: aiFeedback.createdAt,
      conversationId: aiFeedback.conversationId,
      messageId: aiFeedback.messageId,
      answerText: aiMessages.content,
    })
    .from(aiFeedback)
    .leftJoin(aiMessages, eq(aiMessages.id, aiFeedback.messageId))
    .where(where)
    .orderBy(desc(aiFeedback.createdAt), desc(aiFeedback.id))
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  const page = (hasMore ? rows.slice(0, limit) : rows) as AiFeedbackRow[];
  return { entries: page, nextCursor: hasMore ? encodeCursor(page[page.length - 1]!) : null };
}

/** Aggregate counts for the review page's summary tiles. */
export async function aiFeedbackSummary(): Promise<{ up: number; down: number; last7dDown: number }> {
  const db = getDb();
  const [totals] = (await db
    .select({
      up: sql<number>`count(*) filter (where ${aiFeedback.rating} = 'up')::int`,
      down: sql<number>`count(*) filter (where ${aiFeedback.rating} = 'down')::int`,
      last7dDown: sql<number>`count(*) filter (where ${aiFeedback.rating} = 'down' and ${aiFeedback.createdAt} > now() - interval '7 days')::int`,
    })
    .from(aiFeedback)) as [{ up: number; down: number; last7dDown: number }];
  return totals ?? { up: 0, down: 0, last7dDown: 0 };
}

/** Full message thread for one conversation, oldest first — the context around
 *  a flagged answer, so an admin can see what led up to it before curating a fix. */
export async function conversationThread(
  conversationId: string,
): Promise<Array<{ id: string; role: 'user' | 'assistant'; content: string; createdAt: Date }>> {
  const db = getDb();
  return db
    .select({
      id: aiMessages.id,
      role: aiMessages.role,
      content: aiMessages.content,
      createdAt: aiMessages.createdAt,
    })
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, conversationId))
    .orderBy(asc(aiMessages.createdAt));
}

/** True if the conversation id resolves to a real row (avoids leaking a 200
 *  for a stale/foreign id when an admin clicks into one). */
export async function conversationExists(conversationId: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ id: aiConversations.id })
    .from(aiConversations)
    .where(eq(aiConversations.id, conversationId))
    .limit(1);
  return Boolean(row);
}

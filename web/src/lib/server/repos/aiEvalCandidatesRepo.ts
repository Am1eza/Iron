/** Eval-candidate queue (US-05.4) — flagged 👎 conversations queued for an
 *  AI engineer to manually turn into a real scripted evals.test.ts scenario.
 *  See the schema comment on aiEvalCandidates for why this is a review
 *  queue, not an auto-write into the test source. */
import { desc, eq, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import { getDb } from '@/lib/server/db/client';
import { aiEvalCandidates, type AI_EVAL_CANDIDATE_STATUSES } from '@/lib/server/db/schema';

export type AiEvalCandidateRow = typeof aiEvalCandidates.$inferSelect;
export type AiEvalCandidateStatus = (typeof AI_EVAL_CANDIDATE_STATUSES)[number];

export async function createEvalCandidate(input: {
  conversationId?: string | null;
  messageId?: string | null;
  question: string;
  badAnswer: string;
  note?: string | null;
  createdBy?: string | null;
}): Promise<AiEvalCandidateRow> {
  const [row] = await getDb()
    .insert(aiEvalCandidates)
    .values({
      id: ulid(),
      conversationId: input.conversationId ?? null,
      messageId: input.messageId ?? null,
      question: input.question,
      badAnswer: input.badAnswer,
      note: input.note ?? null,
      createdBy: input.createdBy ?? null,
    })
    .returning();
  return row!;
}

/** Paged review queue. `total` is the count for the SAME status filter, so the
 *  UI can say how many are really queued rather than «100» forever. */
export async function listEvalCandidates(
  status?: AiEvalCandidateStatus,
  query: { page?: number; perPage?: number } = {},
): Promise<{ rows: AiEvalCandidateRow[]; total: number; page: number; perPage: number }> {
  const db = getDb();
  // `Number('1e400')` is Infinity, which reached OFFSET and made Postgres
  // reject the statement as a bigint syntax error → 500.
  const rawPage = Number.isFinite(query.page) ? (query.page as number) : 1;
  const page = Math.min(100_000, Math.max(1, Math.floor(rawPage)));
  const rawPerPage = Number.isFinite(query.perPage) ? (query.perPage as number) : 50;
  const perPage = Math.min(200, Math.max(1, Math.floor(rawPerPage)));
  const where = status ? eq(aiEvalCandidates.status, status) : undefined;
  const [rows, total] = await Promise.all([
    db
      .select()
      .from(aiEvalCandidates)
      .where(where)
      .orderBy(desc(aiEvalCandidates.createdAt))
      .limit(perPage)
      .offset((page - 1) * perPage),
    db.select({ n: sql<number>`count(*)::int` }).from(aiEvalCandidates).where(where),
  ]);
  return { rows, total: total[0]?.n ?? 0, page, perPage };
}

export async function updateEvalCandidateStatus(id: string, status: AiEvalCandidateStatus): Promise<AiEvalCandidateRow | null> {
  const [row] = await getDb().update(aiEvalCandidates).set({ status }).where(eq(aiEvalCandidates.id, id)).returning();
  return row ?? null;
}

/** Eval-candidate queue (US-05.4) — flagged 👎 conversations queued for an
 *  AI engineer to manually turn into a real scripted evals.test.ts scenario.
 *  See the schema comment on aiEvalCandidates for why this is a review
 *  queue, not an auto-write into the test source. */
import { desc, eq } from 'drizzle-orm';
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

export async function listEvalCandidates(status?: AiEvalCandidateStatus, limit = 100): Promise<AiEvalCandidateRow[]> {
  const q = getDb().select().from(aiEvalCandidates);
  const rows = await (status ? q.where(eq(aiEvalCandidates.status, status)) : q)
    .orderBy(desc(aiEvalCandidates.createdAt))
    .limit(Math.min(Math.max(limit, 1), 200));
  return rows;
}

export async function updateEvalCandidateStatus(id: string, status: AiEvalCandidateStatus): Promise<AiEvalCandidateRow | null> {
  const [row] = await getDb().update(aiEvalCandidates).set({ status }).where(eq(aiEvalCandidates.id, id)).returning();
  return row ?? null;
}

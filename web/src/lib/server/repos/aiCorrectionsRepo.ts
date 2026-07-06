/** Curated AI corrections — golden answers promoted from flagged conversations,
 *  retrieved into the advisor's grounded context (see aiTools searchGuides). */
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import { getDb } from '@/lib/server/db/client';
import { aiCorrections } from '@/lib/server/db/schema';
import { normalizeDigits, toPersianDigits } from '@/lib/utils/format';

export type AiCorrectionRow = typeof aiCorrections.$inferSelect;

export async function createCorrection(input: {
  question: string;
  answer: string;
  sourceMessageId?: string | null;
  createdBy?: string | null;
}): Promise<AiCorrectionRow> {
  const [row] = await getDb()
    .insert(aiCorrections)
    .values({
      id: ulid(),
      question: input.question,
      answer: input.answer,
      sourceMessageId: input.sourceMessageId ?? null,
      createdBy: input.createdBy ?? null,
    })
    .returning();
  return row!;
}

export async function listCorrections(limit = 100): Promise<AiCorrectionRow[]> {
  return getDb()
    .select()
    .from(aiCorrections)
    .orderBy(desc(aiCorrections.createdAt))
    .limit(Math.min(Math.max(limit, 1), 200));
}

export async function setCorrectionActive(id: string, isActive: boolean): Promise<void> {
  await getDb().update(aiCorrections).set({ isActive }).where(eq(aiCorrections.id, id));
}

/**
 * Retrieve the best curated corrections for a query — trigram-ranked over the
 * question text, active only. Mirrors searchPublishedGuides' token/variant
 * approach so Persian digit variants match. Returns [] on any error so the
 * advisor degrades to published guides alone (never breaks a live answer).
 */
export async function searchCorrections(
  q: string,
  limit = 2,
): Promise<Array<{ question: string; answer: string }>> {
  try {
    const trimmed = q.trim();
    const tokens = [...new Set(trimmed.split(/\s+/).filter((t) => t.length >= 2))];
    if (tokens.length === 0) return [];
    const variantsOf = (t: string) => [...new Set([t, normalizeDigits(t), toPersianDigits(t)])];
    const anyToken = or(
      ...tokens.flatMap((token) =>
        variantsOf(token).flatMap((v) => {
          const term = `%${v}%`;
          return [ilike(aiCorrections.question, term), ilike(aiCorrections.answer, term)];
        }),
      ),
    );
    const rows = await getDb()
      .select({ question: aiCorrections.question, answer: aiCorrections.answer })
      .from(aiCorrections)
      .where(and(eq(aiCorrections.isActive, true), anyToken))
      .orderBy(desc(sql`similarity(${aiCorrections.question}, ${trimmed})`))
      .limit(limit);
    return rows;
  } catch {
    return [];
  }
}

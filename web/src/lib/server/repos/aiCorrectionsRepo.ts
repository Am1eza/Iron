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

/** Paged correction library. The library only grows — it's the advisor's
 *  improvement mechanism — so the caller gets `total` too, otherwise a capped
 *  page reads as a complete count. */
export async function listCorrections(query: { page?: number; perPage?: number } = {}): Promise<{
  rows: AiCorrectionRow[];
  total: number;
  page: number;
  perPage: number;
}> {
  const db = getDb();
  // `Number('1e400')` is Infinity, which reached OFFSET and made Postgres
  // reject the statement as a bigint syntax error → 500.
  const rawPage = Number.isFinite(query.page) ? (query.page as number) : 1;
  const page = Math.min(100_000, Math.max(1, Math.floor(rawPage)));
  const rawPerPage = Number.isFinite(query.perPage) ? (query.perPage as number) : 50;
  const perPage = Math.min(200, Math.max(1, Math.floor(rawPerPage)));
  const [rows, total] = await Promise.all([
    db
      .select()
      .from(aiCorrections)
      .orderBy(desc(aiCorrections.createdAt))
      .limit(perPage)
      .offset((page - 1) * perPage),
    db.select({ n: sql<number>`count(*)::int` }).from(aiCorrections),
  ]);
  return { rows, total: total[0]?.n ?? 0, page, perPage };
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

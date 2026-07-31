// @vitest-environment node
/**
 * Server-side pagination for the two AI-review admin lists. Both used to hard
 * cap at 100 rows with no total, so a capped page read as a complete count.
 * What matters here: `total` counts the whole (filtered) set rather than the
 * page, pages don't overlap or drop rows, and an absurd `page` (the
 * `Number('1e400')` → Infinity → OFFSET → Postgres 500 case) is clamped
 * instead of reaching the database.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '@/test/db';
import { createCorrection, listCorrections } from './aiCorrectionsRepo';
import { createEvalCandidate, listEvalCandidates, updateEvalCandidateStatus } from './aiEvalCandidatesRepo';

let close: () => Promise<void>;

beforeAll(async () => {
  ({ close } = await createTestDb());
}, 120_000);
afterAll(async () => {
  await close();
});

describe('listCorrections — pagination', () => {
  it('reports the full total, pages without overlap, and clamps absurd page numbers', async () => {
    for (let i = 0; i < 7; i++) {
      await createCorrection({ question: `پرسش ${i}`, answer: `پاسخ ${i}` });
    }

    const first = await listCorrections({ page: 1, perPage: 3 });
    expect(first.rows).toHaveLength(3);
    expect(first.total).toBe(7);
    expect(first.page).toBe(1);
    expect(first.perPage).toBe(3);

    const second = await listCorrections({ page: 2, perPage: 3 });
    const third = await listCorrections({ page: 3, perPage: 3 });
    expect(second.rows).toHaveLength(3);
    expect(third.rows).toHaveLength(1);
    const ids = [...first.rows, ...second.rows, ...third.rows].map((r) => r.id);
    expect(new Set(ids).size).toBe(7);

    // Infinity/NaN must never reach OFFSET — they fall back to the defaults
    // rather than being passed through as a bigint Postgres rejects.
    const absurd = await listCorrections({ page: Number('1e400'), perPage: Number('nope') });
    expect(absurd.page).toBe(1);
    expect(absurd.perPage).toBe(50);
    expect(absurd.rows).toHaveLength(7);
    expect(absurd.total).toBe(7);

    // A finite but huge page is clamped, not rejected.
    const huge = await listCorrections({ page: 10 ** 9, perPage: 3 });
    expect(huge.page).toBe(100_000);
    expect(huge.rows).toHaveLength(0);
    expect(huge.total).toBe(7);

    const clampedLow = await listCorrections({ page: 0, perPage: 0 });
    expect(clampedLow.page).toBe(1);
    expect(clampedLow.perPage).toBe(1);
    expect(clampedLow.rows).toHaveLength(1);
  });
});

describe('listEvalCandidates — pagination', () => {
  it('counts only the filtered status, so promoting a row shrinks the pending total', async () => {
    const made: Array<{ id: string }> = [];
    for (let i = 0; i < 5; i++) {
      made.push(await createEvalCandidate({ question: `سؤال ${i}`, badAnswer: `پاسخ نادرست ${i}` }));
    }

    const page1 = await listEvalCandidates('pending', { page: 1, perPage: 2 });
    expect(page1.rows).toHaveLength(2);
    expect(page1.total).toBe(5);
    expect(page1.rows.every((r) => r.status === 'pending')).toBe(true);

    const page3 = await listEvalCandidates('pending', { page: 3, perPage: 2 });
    expect(page3.rows).toHaveLength(1);

    await updateEvalCandidateStatus(made[0]!.id, 'promoted');
    const afterPromote = await listEvalCandidates('pending', { page: 1, perPage: 2 });
    expect(afterPromote.total).toBe(4);
    // Unfiltered still sees every row.
    expect((await listEvalCandidates(undefined, { page: 1, perPage: 100 })).total).toBe(5);

    const absurd = await listEvalCandidates('pending', { page: Number('1e400') });
    expect(absurd.page).toBe(1);
    expect(absurd.rows).toHaveLength(4);
    expect(absurd.total).toBe(4);

    const huge = await listEvalCandidates('pending', { page: 10 ** 9, perPage: 2 });
    expect(huge.page).toBe(100_000);
    expect(huge.rows).toHaveLength(0);
    expect(huge.total).toBe(4);
  });
});

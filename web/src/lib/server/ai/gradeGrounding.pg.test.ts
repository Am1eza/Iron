// @vitest-environment node
/**
 * «چه گریدی می‌خواهی؟ (مثلاً `B400B500` یا `B500B600`)» — a real answer to a
 * real customer on 2026-08-18. Neither code exists in this catalog, in this
 * codebase, or in the Iranian market. The model had nothing grounded to say,
 * because `skus.grade` — a populated column — was read by nothing in the AI
 * path: not the domain facts, not getPrice's output, not even the search that
 * resolves «میلگرد ۱۴ آجدار A3» to a product.
 *
 * These lock all three ends of that fix against a real seeded catalog.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '@/test/db';
import { seedDatabase } from '@/lib/server/db/seed';
import type { Db } from '@/lib/server/db/client';
import { gradesByCategory, searchSkus, tableRows } from '@/lib/server/repos/catalogRepo';
import { getDomainFacts } from '@/lib/server/ai/domainFacts';
import { runTool, AI_SYSTEM_PROMPT } from '@/lib/server/services/aiTools';

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await seedDatabase(db, { historyDays: 1 });
}, 120_000);
afterAll(async () => {
  await close();
});

describe('gradesByCategory', () => {
  it('reports the grade codes the catalog actually stores', async () => {
    const grades = await gradesByCategory();
    expect(grades['میلگرد']).toBeDefined();
    // The seeded rebar sub-categories carry A1 (ساده), A2, A3 and A4 (آلیاژی).
    expect(grades['میلگرد']).toEqual(expect.arrayContaining(['A2', 'A3']));
    // …and nothing outside the catalog, whatever the model likes to say.
    for (const list of Object.values(grades)) {
      expect(list).not.toContain('B400B500');
      expect(list).not.toContain('B500B600');
    }
  });
});

describe('domain facts', () => {
  it('hands the advisor the real grade list, and forbids inventing others', async () => {
    const facts = await getDomainFacts();
    expect(facts).toContain('گریدهای واقعی');
    expect(facts).toContain('A3');
    expect(facts).toContain('نامش را نساز');
  });
});

describe('AI_SYSTEM_PROMPT', () => {
  it('names the invented codes so the ban is unambiguous', () => {
    // Same technique the punctuation rules use: quote the offender.
    expect(AI_SYSTEM_PROMPT).toContain('B400B500');
    expect(AI_SYSTEM_PROMPT).toContain('کد گرید را هم مثل عدد نساز');
  });
});

describe('grade-aware product search', () => {
  it('resolves «میلگرد ۱۴ آجدار A3» without having to drop the grade', async () => {
    const rows = await searchSkus('میلگرد ۱۴ آجدار A3', 5);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.grade).toBe('A3');
  });

  it('does not let a bare size token pull in every graded row', async () => {
    // «۳» is not grade-shaped, so it must never match grade `A3`. This is the
    // one way reading the grade column could have widened search for everyone.
    const rebar = await tableRows('rebar');
    const size = rebar.find((r) => r.size)?.size;
    expect(size).toBeTruthy();
    const rows = await searchSkus(`میلگرد ${size}`, 50);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.size).toBe(size);
  });

  it('surfaces the grade through getPrice so the model can quote it', async () => {
    const result = (await runTool('getPrice', { query: 'میلگرد ۱۴ آجدار' }, null)) as {
      results: Array<{ grade?: string }>;
    };
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results.some((r) => typeof r.grade === 'string' && r.grade.length > 0)).toBe(true);
  });
});

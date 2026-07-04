// @vitest-environment node
/**
 * Integration test for the searchGuides AI tool (grounded knowledge answers)
 * against a real seeded pglite — the seed ships published راهنما articles, so
 * the canonical knowledge question («فرق A2 و A3؟») must land on the grade
 * guide even though «فرق» itself appears nowhere in it (the majority-token
 * match), and the published-only gate must hold: a draft article may never
 * leak into an AI answer.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '@/test/db';
import { seedDatabase } from '@/lib/server/db/seed';
import type { Db } from '@/lib/server/db/client';
import { createArticle } from '@/lib/server/repos/articlesRepo';
import { runTool } from '@/lib/server/services/aiTools';
import { GroundingLedger } from '@/lib/server/ai/grounding';

type GuideResult = { results: Array<{ title: string; slug: string; excerpt: string }>; note?: string };
type ErrorResult = { error: string };

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await seedDatabase(db, { historyDays: 1 });
}, 120_000);
afterAll(async () => {
  await close();
});

async function searchGuides(query: string): Promise<GuideResult> {
  return (await runTool('searchGuides', { query }, null)) as GuideResult;
}

describe('searchGuides tool', () => {
  it('the canonical knowledge question «فرق A2 و A3» finds the seeded grade guide', async () => {
    const r = await searchGuides('فرق A2 و A3');
    expect(r.results.length).toBeGreaterThan(0);
    const top = r.results[0]!;
    // The seed's grade guide («راهنمای انتخاب گرید میلگرد: A2، A3 یا A4؟»).
    expect(top.slug).toBe('choosing-rebar-grade');
    expect(top.title).toContain('گرید');
    // The model cites «طبق راهنمای آهن‌تایم» + title and quotes the excerpt.
    expect(top.excerpt.length).toBeGreaterThan(10);
    expect(top.excerpt.length).toBeLessThanOrEqual(420); // ~400 chars + ellipses
  });

  it('caps at the top-3 published guides even for a broad query', async () => {
    const r = await searchGuides('میلگرد');
    expect(r.results.length).toBeGreaterThan(0);
    expect(r.results.length).toBeLessThanOrEqual(3);
    for (const hit of r.results) {
      expect(hit.title).toBeTruthy();
      expect(hit.slug).toBeTruthy();
      expect(hit.excerpt).toBeTruthy();
    }
  });

  it('never surfaces a draft article — published-only, same gate as the public site', async () => {
    await createArticle({
      slug: `draft-guide-${Date.now()}`,
      type: 'blog',
      title: 'راهنمای فوق‌سری زنگ‌زدگی گالوانیزه',
      bodyMd: 'کلیدواژهٔ یکتا: زنگ‌زدگی گالوانیزه فوق‌سری.',
    });
    const r = await searchGuides('زنگ‌زدگی فوق‌سری');
    expect(r.results).toEqual([]);
  });

  it('an unmatched topic returns an honest empty result (note tells the model to say so)', async () => {
    const r = await searchGuides('پرورش ماهی قزل‌آلا');
    expect(r.results).toEqual([]);
    expect(r.note).toBeTruthy();
  });

  it('an empty query errors instead of dumping arbitrary articles', async () => {
    const r = (await runTool('searchGuides', { query: '  ' }, null)) as ErrorResult;
    expect(r.error).toBeTruthy();
  });

  it('excerpt numbers become quotable through the ledger (addFromJson scans strings)', async () => {
    const r = await searchGuides('پیش‌بینی قیمت میلگرد تیرماه');
    expect(r.results.length).toBeGreaterThan(0);
    const ledger = new GroundingLedger();
    ledger.addFromJson(r);
    // The forecast guide's title carries «۱۴۰۵» — quoting a figure the tool
    // itself returned must be grounded, never censored.
    expect(ledger.has(1405)).toBe(true);
  });
});

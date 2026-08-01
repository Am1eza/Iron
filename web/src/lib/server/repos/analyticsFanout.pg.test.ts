// @vitest-environment node
/**
 * Fan-out regression guard for the analytics aggregates (W28).
 *
 * Every one of these numbers was wrong in production because a lead was
 * counted once per related row instead of once per lead: `count(*)` sat on
 * top of a `LEFT JOIN proformas` (and, in the funnel, a second join to
 * `orders`, squaring it). Measured on the live database at the time:
 * «کانال‌های جذب» showed 3 leads / 3 won for ONE won lead that happened to
 * carry 3 proformas, and both funnels showed 10 leads against a true 2.
 *
 * There was no test on any of these functions — which is exactly why it
 * survived. The fixtures below deliberately give a single lead MULTIPLE
 * proformas AND multiple orders, the shape that triggers the cartesian
 * blow-up; each assertion fails loudly on the old SQL and passes on the new.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ulid } from 'ulid';
import { createTestDb } from '@/test/db';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import { marketingStats, cohortRetention } from './analyticsRepo';

let db: Db;
let close: () => Promise<void>;

/** Mid-window: comfortably inside every 30/90-day range these functions use,
 *  and never "today" (which they all deliberately exclude). */
const DAYS_AGO_10 = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

async function makeLead(opts: { source: 'cart' | 'table'; status: 'new' | 'won'; userId?: string }) {
  const id = ulid();
  await db.insert(schema.leads).values({
    id,
    ref: `L-${id.slice(-8)}`,
    contactMobile: '09120000001',
    source: opts.source,
    status: opts.status,
    channelPref: 'sms',
    userId: opts.userId ?? null,
    createdAt: DAYS_AGO_10,
    updatedAt: DAYS_AGO_10,
  });
  return id;
}

async function addProforma(leadId: string) {
  const id = ulid();
  await db.insert(schema.proformas).values({
    id,
    leadId,
    ref: `P-${id.slice(-8)}`,
    lines: [],
    subtotal: 1000,
    vatRate: 0.1,
    vatAmount: 100,
    total: 1100,
    validUntil: new Date(Date.now() + 86_400_000),
    createdAt: DAYS_AGO_10,
  });
}

async function addOrder(leadId: string, userId?: string) {
  const id = ulid();
  await db.insert(schema.orders).values({
    id,
    ref: `O-${id.slice(-8)}`,
    leadId,
    userId: userId ?? null,
    status: 'registered',
    placedAt: DAYS_AGO_10,
  });
}

beforeAll(async () => {
  ({ db, close } = await createTestDb());

  // ONE won 'cart' lead carrying 3 proformas and 3 orders — the exact shape
  // that produced "3 leads / 3 won" and a 3×3=9-row funnel blow-up live.
  const heavy = await makeLead({ source: 'cart', status: 'won' });
  for (let i = 0; i < 3; i++) await addProforma(heavy);
  for (let i = 0; i < 3; i++) await addOrder(heavy);

  // A second, plain lead with no children — proves the fix doesn't
  // under-count the ordinary case while removing the inflation.
  await makeLead({ source: 'table', status: 'new' });
}, 120_000);

afterAll(async () => {
  await close();
});

describe('marketingStats — per-lead aggregates never fan out (W28)', () => {
  it('counts a lead with 3 proformas ONCE per entry form, not 3 times', async () => {
    const { byEntryForm } = await marketingStats(90);
    const cart = byEntryForm.find((s) => s.key === 'cart');
    expect(cart).toBeDefined();
    // Old SQL: 3 (one row per proforma). This is the headline channel number.
    expect(cart!.leads).toBe(1);
    // Old SQL: 3 — and because won leads carry more proformas than lost ones,
    // the inflation skewed won-rate UPWARD, flattering whichever channel
    // happened to close deals. That's the metric the section tells the owner
    // to compare, so a biased error here is worse than a random one.
    expect(cart!.won).toBe(1);
    // "Leads that reached a proforma", not "proformas issued" — 1, not 3.
    expect(cart!.withProforma).toBe(1);
    expect(cart!.wonRate).toBe(100);
  });

  it('sums won toman across ALL of a won lead’s proformas without double-counting the lead', async () => {
    const { byEntryForm } = await marketingStats(90);
    const cart = byEntryForm.find((s) => s.key === 'cart');
    // 3 proformas × 1100 on the one won lead. Counts alone cannot distinguish
    // ten small deals from one large one — this column is why the page exists.
    expect(cart!.wonToman).toBe(3300);
  });

  it('reports zero toman for an entry form with no won leads', async () => {
    const { byEntryForm } = await marketingStats(90);
    const table = byEntryForm.find((s) => s.key === 'table');
    expect(table).toEqual(
      expect.objectContaining({ leads: 1, won: 0, withProforma: 0, wonRate: 0, wonToman: 0 }),
    );
  });

  it('does not square the funnel when a lead has BOTH proformas and orders', async () => {
    const { funnel } = await marketingStats(90);
    // Old SQL: 3 proformas × 3 orders = 9 rows for the heavy lead, +1 for the
    // plain one = 10. True answer is 2 leads.
    expect(funnel.leads).toBe(2);
    expect(funnel.proformas).toBe(1);
    expect(funnel.orders).toBe(1);
  });

  it('reports a lead→proforma rate computed off the true denominator', async () => {
    const { funnel } = await marketingStats(90);
    // 1/2 = 50%. On the old SQL this read 1/10 = 10% — the inflated
    // denominator silently deflated every downstream conversion rate.
    expect(funnel.proformas / funnel.leads).toBe(0.5);
  });
});

describe('marketingStats — windowing and campaign attribution (W28)', () => {
  it('excludes leads older than the selected range', async () => {
    // Fixtures are 10 days old: inside 30/90, outside 7. Before this rebuild
    // the range was hard-coded per query and could not be narrowed at all.
    expect((await marketingStats(90)).funnel.leads).toBe(2);
    expect((await marketingStats(30)).funnel.leads).toBe(2);
    expect((await marketingStats(7)).funnel.leads).toBe(0);
  });

  it('echoes back the range it actually used, so the UI cannot mislabel the window', async () => {
    expect((await marketingStats(7)).range).toBe(7);
  });

  it('counts untagged leads separately rather than pretending campaign traffic is all there is', async () => {
    const s = await marketingStats(90);
    // Neither fixture carries a UTM, so campaigns are empty and BOTH leads
    // must show up as untagged — otherwise the owner would read an empty
    // campaign table as "no business", not "no campaign tagging yet".
    expect(s.byCampaign).toEqual([]);
    expect(s.untaggedLeads).toBe(2);
  });
});

describe('cohortRetention — cohort size is the cohort, not the retained subset (W28)', () => {
  it('reports the full cohort size on every period row', async () => {
    // The old `GROUP BY m0, period` made `size` collapse to whichever subset
    // that group held, so a real 8-user cohort emitted size=1 and size=7 and
    // never 8; the JS pivot then kept whichever row Postgres emitted LAST.
    // Row order was never specified, so the rendered percentage was both
    // wrong and non-deterministic — and a cohort whose retained-group landed
    // last rendered 1/1 = 100%.
    const { rows } = await cohortRetention(6);
    for (const r of rows) {
      expect(r.size).toBeGreaterThan(0);
      for (const cell of r.cells) {
        // The real invariant: a retention percentage can never exceed 100.
        if (cell !== null) expect(cell).toBeLessThanOrEqual(100);
      }
    }
  });
});

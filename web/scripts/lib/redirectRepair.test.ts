/**
 * The redirect-repair planner. Every case below is a shape the production
 * table was actually found in (audit 1405/06/01: 22 two-hop chains, 57 rows
 * landing on a 404, eight rows that were both), plus the four states the
 * planner is required to refuse rather than guess at.
 *
 * These exist because the repair is now on a timer
 * (`ops/systemd/ahantime-redirect-repair.timer`) — unattended code that
 * rewrites production URLs has to be pinned by something other than a human
 * reading its dry run.
 */
import { describe, it, expect } from 'vitest';
import {
  MAX_HOPS,
  RedirectRepairAbort,
  isLive,
  nearestLiveAncestor,
  planRedirectRepairs,
  summarise,
  type CatalogState,
  type RedirectRow,
} from './redirectRepair';

/** `sheet` and `sheet/galvanized` and one SKU under it are the live catalog. */
const state: CatalogState = {
  categories: new Set(['sheet', 'steel']),
  subCategories: new Set(['sheet/galvanized', 'steel/pipe']),
  skus: new Set(['sheet-galv-2mm']),
};

let n = 0;
const redirect = (fromPath: string, toPath: string): RedirectRow => ({
  id: `r${++n}`,
  fromPath,
  toPath,
});

describe('isLive', () => {
  it('answers for every level of the /prices tree', () => {
    expect(isLive('/prices', state)).toBe(true);
    expect(isLive('/prices/sheet', state)).toBe(true);
    expect(isLive('/prices/sheet/galvanized', state)).toBe(true);
    expect(isLive('/prices/sheet/galvanized/sheet-galv-2mm', state)).toBe(true);
  });

  it('reports a deleted category, sub-category or SKU as dead', () => {
    expect(isLive('/prices/varagh-garm', state)).toBe(false);
    expect(isLive('/prices/sheet/strip', state)).toBe(false);
    expect(isLive('/prices/sheet/galvanized/sheet-galv-9mm', state)).toBe(false);
  });

  it('treats a facet path as live whenever its category is', () => {
    // `/prices/<cat>/factory/<f>` is a route in its own right, not a
    // sub-category. Reading `factory` as a dead sub-category would truncate
    // a perfectly good facet URL up to the category.
    expect(isLive('/prices/sheet/factory/foolad-mobarakeh', state)).toBe(true);
    expect(isLive('/prices/sheet/size/2mm', state)).toBe(true);
    expect(isLive('/prices/varagh-garm/factory/foolad-mobarakeh', state)).toBe(false);
  });

  it('declines to judge anything outside /prices', () => {
    // `null` is "not this planner's business" — the seven /blog and /news
    // rows must be left exactly as they are, not repaired to `/prices`.
    expect(isLive('/blog/rebar-guide', state)).toBeNull();
    expect(isLive('/news', state)).toBeNull();
    expect(isLive('/prices/sheet/galvanized/sheet-galv-2mm/extra', state)).toBeNull();
  });
});

describe('nearestLiveAncestor', () => {
  it('walks up to the first page that answers 200', () => {
    expect(nearestLiveAncestor('/prices/sheet/strip', state)).toBe('/prices/sheet');
    expect(nearestLiveAncestor('/prices/sheet/galvanized/gone', state)).toBe(
      '/prices/sheet/galvanized',
    );
  });

  it('skips a dead intermediate rather than stopping at it', () => {
    // The SKU and its sub-category are both gone; the category is not.
    expect(nearestLiveAncestor('/prices/sheet/strip/strip-3mm', state)).toBe('/prices/sheet');
  });

  it('floors at /prices when the whole branch is gone', () => {
    expect(nearestLiveAncestor('/prices/varagh-garm/tasme', state)).toBe('/prices');
  });
});

describe('planRedirectRepairs · leaves correct rows alone', () => {
  it('plans nothing for a single hop onto a live page', () => {
    const plan = planRedirectRepairs([redirect('/prices/vrgh', '/prices/sheet')], state);

    expect(plan.changes).toEqual([]);
  });

  it('leaves a /blog or /news row untouched', () => {
    const rows = [redirect('/blog/old', '/blog/new'), redirect('/news/old', '/news/new')];

    const plan = planRedirectRepairs(rows, state);

    expect(plan.changes).toEqual([]);
    expect(plan.untouched).toHaveLength(2);
  });

  it('is idempotent — replanning over its own output changes nothing', () => {
    // This is what makes it safe on a timer. Applying the plan and running
    // again must be a no-op, or the unit flaps between two states.
    const rows = [
      redirect('/prices/vrgh-grm', '/prices/varagh-garm'),
      redirect('/prices/varagh-garm', '/prices/sheet'),
    ];
    const first = planRedirectRepairs(rows, state);
    const applied = rows.map((r) => {
      const change = first.changes.find((c) => c.row.id === r.id);
      return change ? { ...r, toPath: change.to } : r;
    });

    expect(planRedirectRepairs(applied, state).changes).toEqual([]);
  });
});

describe('planRedirectRepairs · collapsing chains', () => {
  it('collapses a two-hop chain to the terminal', () => {
    // The exact production shape: /prices/vrgh-grm → /prices/varagh-garm →
    // /prices/sheet, where middleware only ever resolves one hop per request.
    const rows = [
      redirect('/prices/vrgh-grm', '/prices/varagh-garm'),
      redirect('/prices/varagh-garm', '/prices/sheet'),
    ];

    const { collapsed } = summarise(planRedirectRepairs(rows, state));

    expect(collapsed).toHaveLength(1);
    expect(collapsed[0]!.row.fromPath).toBe('/prices/vrgh-grm');
    expect(collapsed[0]!.to).toBe('/prices/sheet');
    expect(collapsed[0]!.via).toEqual(['/prices/varagh-garm']);
  });

  it('collapses a chain that leaves /prices, without judging where it lands', () => {
    const rows = [redirect('/prices/old', '/prices/older'), redirect('/prices/older', '/blog/why')];

    const { collapsed, reaimed } = summarise(planRedirectRepairs(rows, state));

    expect(collapsed[0]!.to).toBe('/blog/why');
    expect(reaimed).toEqual([]);
  });

  it('handles a chain that is BOTH long and dead-ended in one pass', () => {
    // Eight of the 22 production chains ended at a 404, so collapsing alone
    // would have produced a tidier route to nowhere.
    const rows = [
      redirect('/prices/vrgh-grm', '/prices/varagh-garm'),
      redirect('/prices/varagh-garm', '/prices/sheet/strip'),
    ];

    const plan = planRedirectRepairs(rows, state);
    const { collapsed, reaimed } = summarise(plan);

    // Both rows are repaired, and the head of the chain is in both classes —
    // it is one change that shortens the route AND moves its destination off
    // a 404. `changes` is the union, so the totals must not be added up.
    expect(plan.changes).toHaveLength(2);
    expect(collapsed).toHaveLength(1);
    expect(reaimed).toHaveLength(2);
    expect(collapsed[0]).toBe(reaimed[0]);
    expect(collapsed[0]!.row.fromPath).toBe('/prices/vrgh-grm');
    expect(collapsed[0]!.to).toBe('/prices/sheet');
    expect(collapsed[0]!.terminalDead).toBe('/prices/sheet/strip');
    // …and the tail, which was never a chain, is re-aimed on its own.
    expect(reaimed[1]!.row.fromPath).toBe('/prices/varagh-garm');
    expect(reaimed[1]!.to).toBe('/prices/sheet');
  });
});

describe('planRedirectRepairs · re-aiming dead destinations', () => {
  it('re-aims a row whose destination 404s at the nearest live ancestor', () => {
    const rows = [redirect('/prices/varagh-garm/tasme', '/prices/sheet/strip')];

    const { reaimed } = summarise(planRedirectRepairs(rows, state));

    expect(reaimed).toHaveLength(1);
    expect(reaimed[0]!.terminalDead).toBe('/prices/sheet/strip');
    expect(reaimed[0]!.to).toBe('/prices/sheet');
  });

  it('re-aims a retired SKU at its own sub-category, not at the category', () => {
    // 24 production rows were this shape. The sub-category page IS the right
    // landing — it lists the product's siblings.
    const rows = [redirect('/prices/sheet/galvanized/old-sku', '/prices/sheet/galvanized/gone')];

    const { reaimed } = summarise(planRedirectRepairs(rows, state));

    expect(reaimed[0]!.to).toBe('/prices/sheet/galvanized');
  });

  it('collapses the two-hop chain a delete tombstone creates', () => {
    // The half of the delete fix that is deliberately left to this script. A
    // catalog delete now writes `deleted → surviving ancestor` in ONE bulk
    // statement and skips `collapseAround`'s backward pass, so a row that
    // already pointed at the deleted page becomes two hops. This is the pass
    // that shortens it — which is why the repair is on a timer and not a
    // one-off.
    const rows = [
      redirect('/prices/sheet/old-galv', '/prices/sheet/strip'), // pre-existing
      redirect('/prices/sheet/strip', '/prices/sheet'), // the tombstone
    ];

    const { collapsed, reaimed } = summarise(planRedirectRepairs(rows, state));

    expect(collapsed).toHaveLength(1);
    expect(collapsed[0]!.row.fromPath).toBe('/prices/sheet/old-galv');
    expect(collapsed[0]!.to).toBe('/prices/sheet');
    // The tombstone itself already lands on a live page and is left alone.
    expect(reaimed).toEqual([]);
  });

  it('falls back to /prices when nothing above the destination survives', () => {
    const rows = [redirect('/prices/x', '/prices/varagh-garm/tasme')];

    const { reaimed } = summarise(planRedirectRepairs(rows, state));

    expect(reaimed[0]!.to).toBe('/prices');
  });
});

describe('planRedirectRepairs · refuses rather than guesses', () => {
  it('aborts when a row shadows a live page', () => {
    // PR #227's bug class: middleware answers the redirect before the route
    // matches, so a real page is unreachable. Which side is canonical is a
    // human judgement.
    const rows = [redirect('/prices/sheet/galvanized', '/prices/sheet')];

    expect(() => planRedirectRepairs(rows, state)).toThrow(RedirectRepairAbort);
    expect(() => planRedirectRepairs(rows, state)).toThrow(/shadow a LIVE page/);
  });

  it('aborts on a cycle', () => {
    const rows = [
      redirect('/prices/a', '/prices/b'),
      redirect('/prices/b', '/prices/c'),
      redirect('/prices/c', '/prices/a'),
    ];

    expect(() => planRedirectRepairs(rows, state)).toThrow(/redirect cycle/);
  });

  it(`aborts on a chain longer than ${MAX_HOPS} hops`, () => {
    const rows = Array.from({ length: MAX_HOPS + 2 }, (_, i) =>
      redirect(`/prices/h${i}`, `/prices/h${i + 1}`),
    );

    expect(() => planRedirectRepairs(rows, state)).toThrow(/longer than/);
  });

  it('aborts when the computed destination is itself redirected', () => {
    // Repairing to a path that is somebody's `from_path` would build a new
    // chain while claiming to remove one.
    const rows = [
      redirect('/prices/one', '/prices/sheet/strip/gone'),
      redirect('/prices/sheet', '/prices/steel'),
    ];

    // `/prices/sheet` is live AND a from_path — caught by the shadow check
    // first, which is the stricter of the two and the right one to report.
    expect(() => planRedirectRepairs(rows, state)).toThrow(RedirectRepairAbort);
  });

  it('reports every shadowing row, not just the first', () => {
    const rows = [
      redirect('/prices/sheet', '/prices/steel'),
      redirect('/prices/steel/pipe', '/prices/steel'),
    ];

    expect(() => planRedirectRepairs(rows, state)).toThrow(/2 redirect\(s\) shadow/);
  });
});

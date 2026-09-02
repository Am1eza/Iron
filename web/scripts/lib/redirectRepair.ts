/**
 * The redirect-table repair, as pure functions over a snapshot.
 *
 * This is the planning half of `scripts/repairRedirectTargets.ts`, lifted out
 * of it so that it can be tested and so that it can be run unattended. The
 * logic itself is unchanged; what changed is that it no longer decides by
 * calling `process.exit`, and no longer needs a database to be exercised.
 *
 * ## Why this has to run on a schedule
 *
 * The original was written as a one-off for a production audit (1405/06/01)
 * that found 22 two-hop chains and 57 rows whose destination was a 404, and
 * it was never registered anywhere. That was the wrong shape for the problem,
 * because the problem regenerates:
 *
 *   · `redirectsRepo.collapseAround` keeps the table one hop deep for every
 *     row written THROUGH THE PANEL, and nothing else. A row can still be
 *     lengthened into a chain by an admin action that does not touch it.
 *   · A delete now leaves a tombstone at every level (`catalogRoute.ts`'s
 *     `writeDeleteRedirects` — the audit's finding 13), and does so in one
 *     bulk statement that deliberately SKIPS the backward collapse. Every
 *     tombstone therefore turns any pre-existing row aimed at the deleted
 *     page into a two-hop chain, and this is what shortens it. That is a
 *     trade made on purpose: 281 serial round trips inside one delete
 *     request, against a chain that resolves correctly and gets collapsed
 *     the same night.
 *   · Rows are also written outside the panel entirely — the 41 scripts in
 *     `web/scripts/`, and raw `DELETE FROM` in SQL migrations (`0049`). None
 *     of those go anywhere near `collapseAround`, and nothing re-checks them.
 *
 * A redirect to a 404 is worse than no redirect: the crawler spends two
 * fetches to reach a dead end, and every scrap of link equity aimed at the
 * old URL is thrown away at the second hop instead of the first.
 *
 * ## What it will and will not decide
 *
 * It re-aims a dead destination at the nearest LIVE ancestor — the page one
 * level up that does answer 200. That is a mechanical, always-defensible
 * improvement on a 404, and it is explicitly not the same as knowing which
 * product a retired URL should really land on. That second question is the
 * owner's; this leaves it open, because a row an owner re-aims by hand
 * afterwards resolves in one hop to a live page and is then never touched
 * again (see `planRedirectRepairs`'s idempotence).
 *
 * It refuses, rather than guesses, whenever the table is in a state a human
 * should look at: a cycle, a chain longer than `MAX_HOPS`, a row that shadows
 * a live page (PR #227's bug class — which side is canonical is a judgement),
 * or a computed destination that is itself somebody's `from_path`.
 */
import { routes } from '../../src/lib/routes';

/** A chain longer than this is not something this planner should reason about. */
export const MAX_HOPS = 8;

/** Path segments that are routes in their own right, not sub-category slugs. */
const FACET_SEGMENTS = new Set(['factory', 'size']);

/**
 * What the catalog holds, as slug sets.
 *
 * Existence IS liveness since #357 dropped `is_active`: a row that is in the
 * table serves a 200 and a row that is gone serves a 404. There is no third
 * state left for this to get wrong.
 */
export type CatalogState = {
  /** `categories.slug` */
  categories: ReadonlySet<string>;
  /** `${category.slug}/${subCategory.slug}` */
  subCategories: ReadonlySet<string>;
  /** `skus.slug` — globally unique, which is why the URL can be validated
   *  without knowing which sub-category the SKU sits under. */
  skus: ReadonlySet<string>;
};

export type RedirectRow = { id: string; fromPath: string; toPath: string };

export type Change = {
  row: RedirectRow;
  /** Where the row should point after the repair. */
  to: string;
  /** The intermediate hops that were collapsed away, in order. */
  via: string[];
  /** The resolved terminal, when it was itself a dead page. */
  terminalDead: string | null;
};

export type RepairPlan = {
  changes: Change[];
  /** Single-hop rows this planner has no opinion about (`/blog`, `/news`). */
  untouched: RedirectRow[];
};

/** Thrown instead of exiting, so a caller can decide what a bad table means. */
export class RedirectRepairAbort extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RedirectRepairAbort';
  }
}

/**
 * Is this path a page the public site serves 200 for?
 *
 * Only `/prices` paths are decidable from catalog state; `null` means "not
 * this planner's business" and the row is left alone rather than guessed at.
 */
export function isLive(path: string, state: CatalogState): boolean | null {
  if (path === routes.prices()) return true;
  if (!path.startsWith(`${routes.prices()}/`)) return null;
  const seg = path.split('/').filter(Boolean); // ['prices', cat, …]
  const [, cat, sub, sku] = seg;
  if (!cat || seg.length > 4) return null;
  if (!state.categories.has(cat)) return false;
  if (sub === undefined) return true;
  // `/prices/<cat>/factory/<f>` and `/prices/<cat>/size/<s>` are facet routes
  // (see `routes.ts`), live whenever their category is. No row uses one
  // today; the case is handled so a future one cannot be mis-read as a dead
  // sub-category and silently truncated to the category.
  if (FACET_SEGMENTS.has(sub)) return true;
  if (!state.subCategories.has(`${cat}/${sub}`)) return false;
  if (sku === undefined) return true;
  return state.skus.has(sku);
}

/** Nearest ancestor of `path` that is live; `/prices` is the floor. */
export function nearestLiveAncestor(path: string, state: CatalogState): string {
  const seg = path.split('/').filter(Boolean);
  for (let n = seg.length - 1; n >= 1; n--) {
    const candidate = `/${seg.slice(0, n).join('/')}`;
    if (isLive(candidate, state) === true) return candidate;
  }
  return routes.prices();
}

/**
 * Follow `toPath` while it is itself a `fromPath`. Returns the terminal and
 * the hops passed through.
 */
function resolveChain(
  row: RedirectRow,
  byFrom: ReadonlyMap<string, RedirectRow>,
): { terminal: string; via: string[] } {
  const via: string[] = [];
  const seen = new Set([row.fromPath]);
  let at = row.toPath;
  for (let i = 0; i < MAX_HOPS; i++) {
    if (seen.has(at)) {
      throw new RedirectRepairAbort(`redirect cycle at ${row.fromPath} (revisits ${at})`);
    }
    const next = byFrom.get(at);
    if (!next) return { terminal: at, via };
    seen.add(at);
    via.push(at);
    at = next.toPath;
  }
  throw new RedirectRepairAbort(`chain from ${row.fromPath} is longer than ${MAX_HOPS} hops`);
}

/**
 * What to change, and nothing else.
 *
 * Idempotent by construction: every decision is recomputed from the snapshot,
 * and a row that already resolves in one hop to a live page produces no
 * change. Running this twice in a row plans nothing the second time, which is
 * what makes it safe to put on a timer.
 *
 * @throws RedirectRepairAbort when the table needs a human, not a repair.
 */
export function planRedirectRepairs(
  rows: readonly RedirectRow[],
  state: CatalogState,
): RepairPlan {
  const byFrom = new Map(rows.map((r) => [r.fromPath, r]));

  // A redirect whose `fromPath` is itself a live page is shadowing that page:
  // middleware answers the redirect before the route ever matches, so the
  // page is unreachable even though the catalog says it exists. PR #227 had
  // to unpick three of these by hand. Which side is canonical is a judgement,
  // so stop rather than pick one.
  const shadowing = rows.filter((r) => isLive(r.fromPath, state) === true);
  if (shadowing.length) {
    throw new RedirectRepairAbort(
      `${shadowing.length} redirect(s) shadow a LIVE page — that is PR #227's bug class and ` +
        `needs a human decision about which side is canonical, not a mechanical repair:\n` +
        shadowing.map((r) => `    ${r.fromPath} → ${r.toPath}`).join('\n'),
    );
  }

  const changes: Change[] = [];
  const untouched: RedirectRow[] = [];

  for (const row of rows) {
    if (isLive(row.toPath, state) === null && !byFrom.has(row.toPath)) {
      untouched.push(row); // /blog, /news — single hop, nothing to decide
      continue;
    }
    const { terminal, via } = resolveChain(row, byFrom);
    const live = isLive(terminal, state);
    if (live === null) {
      // A chain that ends outside /prices. One hop is still better than two.
      if (via.length) changes.push({ row, to: terminal, via, terminalDead: null });
      else untouched.push(row);
      continue;
    }
    const to = live ? terminal : nearestLiveAncestor(terminal, state);
    if (to === row.toPath) continue; // already correct — idempotent
    if (isLive(to, state) !== true) {
      throw new RedirectRepairAbort(`computed destination ${to} for ${row.fromPath} is not live`);
    }
    if (byFrom.has(to)) {
      throw new RedirectRepairAbort(
        `computed destination ${to} for ${row.fromPath} is itself redirected`,
      );
    }
    changes.push({ row, to, via, terminalDead: live ? null : terminal });
  }

  return { changes, untouched };
}

/** The two classes a reader of the report cares about, split out once. */
export function summarise(plan: RepairPlan): {
  collapsed: Change[];
  reaimed: Change[];
} {
  return {
    collapsed: plan.changes.filter((c) => c.via.length > 0),
    reaimed: plan.changes.filter((c) => c.terminalDead !== null),
  };
}

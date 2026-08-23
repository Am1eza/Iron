/** URL redirect management (US-14.3) — old-path → new-path 301/302-style
 *  redirects, configured by an admin instead of a code deploy. Enforced at
 *  request time from `middleware.ts`, on every public-host request — this
 *  takes priority over a real route match, not just 404 fallback, since a
 *  redirect aimed at a still-live page's own URL must actually win. */
import { eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import { getDb } from '@/lib/server/db/client';
import { redirects } from '@/lib/server/db/schema';

export type RedirectRow = typeof redirects.$inferSelect;

/** Leading slash, no trailing slash (except root), no query/hash — so
 *  `/foo/`, `/foo?x=1`, and `foo` all resolve to the same lookup key as
 *  `/foo`. Callers pass either a raw pathname or a full path+query string. */
export function normalizePath(input: string): string {
  const noQuery = input.split(/[?#]/)[0] ?? '';
  const withSlash = noQuery.startsWith('/') ? noQuery : `/${noQuery}`;
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, '') : withSlash;
}

/** The hot path — one indexed lookup, called from not-found.tsx on every
 *  genuinely-unmatched request. Returns null (not a 404) when nothing
 *  matches, so the caller falls through to the real 404 page. */
export async function findRedirect(pathname: string): Promise<Pick<RedirectRow, 'toPath' | 'permanent'> | null> {
  const rows = await getDb()
    .select({ toPath: redirects.toPath, permanent: redirects.permanent })
    .from(redirects)
    .where(eq(redirects.fromPath, normalizePath(pathname)))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Every `fromPath` currently configured, as a lookup set.
 *
 * For `sitemap.ts`. A redirect row wins over a real route match (see
 * `middleware.ts`), so a path can be a live, active, SKU-bearing page in the
 * catalog tables and STILL answer 308 to every crawler. Measured on
 * production 1405/05/31: `/prices/profile/prvfyl-snaty`, `…/prvfyl-sakhtmany`
 * and `…/prvfyl-astyl` were all `is_active = true` sub-categories, all three
 * published in the sitemap, and all three 308'd back to `/prices/profile` by
 * rows left behind when the پروفیل taxonomy was re-slugged. Telling Google to
 * crawl a URL we then refuse to serve is the "redirect" bucket of the
 * Coverage report, self-inflicted.
 *
 * Only the redirect table can answer this — the catalog side has no idea it
 * is being shadowed — so the sitemap has to ask.
 */
export async function listRedirectFromPaths(): Promise<Set<string>> {
  const rows = await getDb().select({ fromPath: redirects.fromPath }).from(redirects);
  return new Set(rows.map((r) => r.fromPath));
}

export async function adminListRedirects(): Promise<RedirectRow[]> {
  return getDb().select().from(redirects).orderBy(redirects.fromPath);
}

export class RedirectLoopError extends Error {}

/** How many hops `wouldLoop` follows before giving up and treating the chain
 *  as suspicious. A legitimate redirect chain this long doesn't happen in
 *  practice (each hop is a manual admin action); a chain this long is far
 *  more likely to be a cycle a human made by accident across several edits. */
const MAX_REDIRECT_CHAIN_HOPS = 10;

/**
 * Would starting a chain at `start` and following each redirect's `toPath`
 * ever loop — either back to `origin` (the fromPath this would-be redirect
 * belongs to) or into any other cycle along the way?
 *
 * The original version of this check only ever looked one hop ahead (does
 * `toPath` have a redirect straight back to `fromPath`?), which caught the
 * common accidental A⇄B swap but not a 3+-hop cycle built up over several
 * separate edits (A→B, then B→C, then C→A — each individual edit looked
 * fine in isolation). At request time `middleware.ts` only ever resolves
 * ONE hop per request — so a stored cycle doesn't crash the server, but a
 * real visitor's browser follows the chain across successive requests and
 * hits its own redirect-loop limit (`ERR_TOO_MANY_REDIRECTS`) on a real
 * public path. This walks the whole chain up front so the loop can never be
 * saved in the first place.
 */
async function wouldLoop(origin: string, start: string): Promise<boolean> {
  const seen = new Set<string>();
  let current = start;
  for (let hop = 0; hop < MAX_REDIRECT_CHAIN_HOPS; hop++) {
    if (current === origin || seen.has(current)) return true;
    seen.add(current);
    const next = await findRedirect(current);
    if (!next) return false;
    current = normalizePath(next.toPath);
  }
  return true; // chain didn't resolve within the hop budget — treat as a loop
}

/**
 * Follow `start` through the table to the path it ultimately lands on.
 *
 * `wouldLoop` has already refused anything that cycles or outruns the hop
 * budget, so this only ever walks a chain that terminates — the loop bound is
 * a belt-and-braces stop, not the real guard.
 */
async function resolveTerminal(start: string): Promise<string> {
  let current = start;
  for (let hop = 0; hop < MAX_REDIRECT_CHAIN_HOPS; hop++) {
    const next = await findRedirect(current);
    if (!next) return current;
    current = normalizePath(next.toPath);
  }
  return current;
}

/**
 * Keep the table one hop deep, from BOTH directions, whenever a row is
 * written.
 *
 * `middleware.ts` resolves exactly one hop per request, so a stored chain is
 * a real extra round trip for the visitor and a second crawl of the same URL
 * for Googlebot. Production had 22 of them (audit 1405/06/01), and none was
 * created by anyone typing a chain into the panel — they grew the other way
 * round, one legal-looking edit at a time:
 *
 *   1405/05/13  the ورق re-slug writes  /prices/vrgh-grm → /prices/varagh-garm
 *   1405/05/22  ورق گرم is folded into ورق:
 *                                       /prices/varagh-garm → /prices/sheet
 *
 * The second row is what turned the first into a chain, and nothing was
 * looking in that direction. So this does two things on every write:
 *
 *   · forward — store where `toPath` ACTUALLY lands, not the first hop;
 *   · backward — re-aim every existing row that pointed at this `fromPath`
 *     at the same destination, since they are now one hop short.
 *
 * The invariant this maintains is "no stored `toPath` is anyone's
 * `fromPath`", which also makes a cycle unconstructible — `wouldLoop` still
 * runs first, and still catches the direct self-redirect this cannot.
 *
 * The trade: once `a → b → c` is stored as `a → c`, the table no longer
 * records that `a` ever went via `b`, so re-pointing `b` later does not drag
 * `a` along. `a` still lands on a real page in one hop, which is what the
 * visitor and the crawler actually pay for.
 */
async function collapseAround(fromPath: string, toPath: string): Promise<string> {
  const terminal = await resolveTerminal(toPath);
  await getDb()
    .update(redirects)
    .set({ toPath: terminal, updatedAt: new Date() })
    .where(eq(redirects.toPath, fromPath));
  return terminal;
}

export async function createRedirect(input: {
  fromPath: string;
  toPath: string;
  permanent?: boolean;
}): Promise<RedirectRow> {
  const fromPath = normalizePath(input.fromPath);
  const toPath = normalizePath(input.toPath);
  if (await wouldLoop(fromPath, toPath)) {
    throw new RedirectLoopError('این مسیر یک حلقهٔ ریدایرکت می‌سازد (مستقیم یا از چند مسیر واسط).');
  }
  const terminal = await collapseAround(fromPath, toPath);
  const rows = await getDb()
    .insert(redirects)
    .values({ id: ulid(), fromPath, toPath: terminal, permanent: input.permanent ?? true })
    .returning();
  return rows[0]!;
}

export async function updateRedirect(
  id: string,
  patch: { toPath?: string; permanent?: boolean },
): Promise<RedirectRow | null> {
  const set: Partial<typeof redirects.$inferInsert> = { updatedAt: new Date() };
  if (patch.toPath !== undefined) {
    // The create path has always rejected a loop — this one silently didn't:
    // PATCHing an existing redirect's destination back onto its own source
    // (or onto a chain that eventually leads back to it) saved cleanly, no
    // different from hand-editing the row in the database.
    const existing = await getDb().select().from(redirects).where(eq(redirects.id, id)).limit(1);
    const fromPath = existing[0]?.fromPath;
    const toPath = normalizePath(patch.toPath);
    if (fromPath !== undefined && (await wouldLoop(fromPath, toPath))) {
      throw new RedirectLoopError('این مسیر یک حلقهٔ ریدایرکت می‌سازد (مستقیم یا از چند مسیر واسط).');
    }
    set.toPath = fromPath === undefined ? toPath : await collapseAround(fromPath, toPath);
  }
  if (patch.permanent !== undefined) set.permanent = patch.permanent;
  const rows = await getDb().update(redirects).set(set).where(eq(redirects.id, id)).returning();
  return rows[0] ?? null;
}

export async function deleteRedirect(id: string): Promise<void> {
  await getDb().delete(redirects).where(eq(redirects.id, id));
}

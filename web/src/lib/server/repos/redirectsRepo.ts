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
  const rows = await getDb()
    .insert(redirects)
    .values({ id: ulid(), fromPath, toPath, permanent: input.permanent ?? true })
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
    set.toPath = toPath;
  }
  if (patch.permanent !== undefined) set.permanent = patch.permanent;
  const rows = await getDb().update(redirects).set(set).where(eq(redirects.id, id)).returning();
  return rows[0] ?? null;
}

export async function deleteRedirect(id: string): Promise<void> {
  await getDb().delete(redirects).where(eq(redirects.id, id));
}

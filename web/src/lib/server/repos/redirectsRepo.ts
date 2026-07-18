/** URL redirect management (US-14.3) — old-path → new-path 301/302-style
 *  redirects, configured by an admin instead of a code deploy. Enforced at
 *  request time from `src/app/not-found.tsx` (only genuinely unmatched
 *  paths reach it — zero risk of shadowing a working route). */
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

export async function createRedirect(input: {
  fromPath: string;
  toPath: string;
  permanent?: boolean;
}): Promise<RedirectRow> {
  const fromPath = normalizePath(input.fromPath);
  const toPath = normalizePath(input.toPath);
  if (fromPath === toPath) {
    throw new RedirectLoopError('مقصد نمی‌تواند همان مبدأ باشد.');
  }
  // Catches the immediate 2-hop case (A→B while B→A already exists) — not
  // exhaustive cycle detection across longer chains, but the cheap, common
  // mistake this guards against costs one extra indexed lookup.
  const reverse = await findRedirect(toPath);
  if (reverse && normalizePath(reverse.toPath) === fromPath) {
    throw new RedirectLoopError('این مسیر یک حلقهٔ ریدایرکت با مسیر مقصد می‌سازد.');
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
  if (patch.toPath !== undefined) set.toPath = normalizePath(patch.toPath);
  if (patch.permanent !== undefined) set.permanent = patch.permanent;
  const rows = await getDb().update(redirects).set(set).where(eq(redirects.id, id)).returning();
  return rows[0] ?? null;
}

export async function deleteRedirect(id: string): Promise<void> {
  await getDb().delete(redirects).where(eq(redirects.id, id));
}

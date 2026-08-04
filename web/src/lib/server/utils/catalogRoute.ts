/**
 * Shared plumbing for the six admin catalog route handlers (W24).
 *
 * These concerns were previously copy-pasted — or simply missing — across the
 * routes, and every omission was admin-visible:
 *
 *  - a duplicate slug escaped as a raw Postgres 23505 and became a generic
 *    500 «خطایی در سرور رخ داد», leaving the admin to guess and retry forever;
 *  - the SKU routes revalidated NOTHING while the taxonomy routes revalidated
 *    the world, so a renamed or retired product kept serving from ISR for up
 *    to five minutes — for a deactivation that meant a delisted product
 *    stayed orderable;
 *  - a slug edit silently 404'd every indexed URL, even though this app ships
 *    a redirects table that `not-found.tsx` already consults.
 */
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/server/db/client';
import { categories, subCategories, skus } from '@/lib/server/db/schema';
import { routes } from '@/lib/routes';
import { DuplicateSlugError, InvalidParentError } from '@/lib/server/repos/catalogAdminRepo';
import { createRedirect, RedirectLoopError } from '@/lib/server/repos/redirectsRepo';
import { safeRevalidatePath } from '@/lib/server/utils/revalidate';
import { invalidateDomainFacts } from '@/lib/server/ai/domainFacts';
import { reportError } from '@/lib/errors/report';

/**
 * Map the catalog repo's typed failures onto responses the admin form can act
 * on. Returns null for anything else, so `withApiErrorHandling` keeps its
 * generic 500 for genuinely unexpected errors.
 */
export function catalogErrorResponse(err: unknown): NextResponse | null {
  if (err instanceof DuplicateSlugError) {
    return NextResponse.json(
      { error: 'duplicate_slug', message: err.message, fields: { [err.field]: err.message } },
      { status: 409 },
    );
  }
  if (err instanceof InvalidParentError) {
    return NextResponse.json({ error: 'invalid_parent', message: err.message }, { status: 400 });
  }
  return null;
}

/**
 * Bust the public caches a catalog write can affect. `/prices` covers the
 * table, sub and SKU pages (all `revalidate = 300`); `/` covers the home
 * cascade. `taxonomy` additionally purges the root layout, which is what the
 * nav and mega-menu render from — the expensive one, so SKU writes skip it.
 *
 * `taxonomy` ALSO drops the AI advisor's `ai:domain-facts` Redis entry, which
 * had no invalidation at all: its 600s TTL was the only thing that ever
 * refreshed it, so for up to ten minutes after a category change the advisor
 * was grounded on the old catalog shape and would deny a live product line
 * exists (or offer a retired one) — see domainFacts.ts. SKU writes are
 * deliberately excluded: those facts carry category/sub-category names only,
 * so a product edit cannot change them and must not pay for the round trip.
 *
 * Async because that invalidation is I/O. It is awaited rather than
 * fire-and-forget because a bare floating promise is not guaranteed to run to
 * completion on this app's Workers target (same reasoning as the `after()`
 * usage in the pricing route). Best-effort throughout — the write is already
 * committed and a cache miss must never fail it.
 */
export async function revalidateCatalog(scope: 'sku' | 'taxonomy'): Promise<void> {
  safeRevalidatePath('/prices', 'layout');
  safeRevalidatePath('/', 'page');
  if (scope === 'taxonomy') {
    safeRevalidatePath('/', 'layout');
    try {
      await invalidateDomainFacts();
    } catch (err) {
      // `cacheDel` already swallows Redis errors, so this only fires on
      // something genuinely unexpected — and even then the category WAS
      // saved. Failing the admin's write (which they would retry, hitting the
      // unique-slug index) to report a stale cache entry is strictly worse
      // than falling back to the 600s TTL.
      reportError(err, { stage: 'catalog.invalidateDomainFacts' });
    }
  }
}

/**
 * Preserve an indexed URL across a slug edit. Best-effort by design: the
 * catalog change is already committed, and a failed redirect must never turn a
 * successful save into a 500 the admin retries (and then collides with the
 * unique index on). A loop is a legitimate no-op — `createRedirect` already
 * rejects the A→B/B→A case.
 */
export async function redirectOnSlugChange(from: string, to: string): Promise<void> {
  if (from === to) return;
  try {
    await createRedirect({ fromPath: from, toPath: to, permanent: true });
  } catch (err) {
    if (err instanceof RedirectLoopError) return;
    reportError(err, { stage: 'catalog.redirectOnSlugChange', from, to });
  }
}

/**
 * A category or sub-category slug is a PATH PREFIX: renaming «rebar» moves the
 * category page, every sub page beneath it, and every product page beneath
 * those. Redirecting only the node's own page would still 404 every indexed
 * product — which is where the organic traffic actually lands. So walk the
 * descendants and redirect each concrete path.
 *
 * Bounded by the catalog's real shape (a category holds tens of products, not
 * thousands), and best-effort throughout for the same reason as above.
 */
export async function redirectTaxonomySlugChange(
  kind: 'category' | 'subCategory',
  id: string,
  oldSlug: string,
  newSlug: string,
): Promise<void> {
  if (oldSlug === newSlug) return;
  const db = getDb();
  if (kind === 'category') {
    const rows = await db
      .select({ subSlug: subCategories.slug, skuSlug: skus.slug })
      .from(subCategories)
      .leftJoin(skus, eq(skus.subCategoryId, subCategories.id))
      .where(eq(subCategories.categoryId, id));
    await redirectOnSlugChange(routes.category(oldSlug), routes.category(newSlug));
    const seenSubs = new Set<string>();
    for (const r of rows) {
      if (!seenSubs.has(r.subSlug)) {
        seenSubs.add(r.subSlug);
        await redirectOnSlugChange(
          routes.subCategory(oldSlug, r.subSlug),
          routes.subCategory(newSlug, r.subSlug),
        );
      }
      if (r.skuSlug) {
        await redirectOnSlugChange(
          routes.sku(oldSlug, r.subSlug, r.skuSlug),
          routes.sku(newSlug, r.subSlug, r.skuSlug),
        );
      }
    }
    return;
  }
  const rows = await db
    .select({ catSlug: categories.slug, skuSlug: skus.slug })
    .from(subCategories)
    .innerJoin(categories, eq(subCategories.categoryId, categories.id))
    .leftJoin(skus, eq(skus.subCategoryId, subCategories.id))
    .where(eq(subCategories.id, id));
  const catSlug = rows[0]?.catSlug;
  if (!catSlug) return;
  await redirectOnSlugChange(routes.subCategory(catSlug, oldSlug), routes.subCategory(catSlug, newSlug));
  for (const r of rows) {
    if (!r.skuSlug) continue;
    await redirectOnSlugChange(
      routes.sku(catSlug, oldSlug, r.skuSlug),
      routes.sku(catSlug, newSlug, r.skuSlug),
    );
  }
}

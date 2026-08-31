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
import { eq, inArray } from 'drizzle-orm';
import { getDb } from '@/lib/server/db/client';
import { categories, subCategories, skus } from '@/lib/server/db/schema';
import { routes } from '@/lib/routes';
import { DuplicateProductError, DuplicateSlugError, InvalidParentError } from '@/lib/server/repos/catalogAdminRepo';
import { createRedirect, createRedirects, RedirectLoopError } from '@/lib/server/repos/redirectsRepo';
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
  // The product already exists. 409 with the existing row's id, so the form can
  // offer to open it instead of leaving the admin to wonder why the save was
  // refused — and so a double-clicked save reports the ONE product it made
  // rather than silently making a second one under a `-2` slug.
  if (err instanceof DuplicateProductError) {
    return NextResponse.json(
      {
        error: 'duplicate_product',
        message: err.message,
        existingId: err.existingId,
        fields: { name: err.message },
      },
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
 * BOTH scopes drop the AI advisor's `ai:domain-facts` Redis entry, which had
 * no invalidation at all: its 600s TTL was the only thing that ever refreshed
 * it, so for up to ten minutes after a catalog change the advisor was grounded
 * on the old catalog shape and would deny a live product line exists (or offer
 * a retired one) — see domainFacts.ts.
 *
 * SKU writes used to be excluded, on the stated grounds that "those facts
 * carry category/sub-category names only, so a product edit cannot change
 * them". That was simply untrue: `getDomainFacts` also injects
 * `gradesByCategory()`, which is `SELECT DISTINCT grade FROM skus` — and it
 * injects it under the sentence «هیچ کد گرید دیگری وجود ندارد؛ اگر گریدی در
 * این فهرست نیست، نامش را نساز و نگو». So adding the first `B500C` product had
 * the advisor telling customers for ten minutes that the grade does not exist,
 * and deleting the last product of a grade had it keep offering that grade —
 * the exact failure the grounding rule exists to prevent, caused by the cache
 * that was supposed to be harmless. One Redis DEL is not a meaningful cost on
 * an admin write that already purged two ISR paths.
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
  if (scope === 'taxonomy') safeRevalidatePath('/', 'layout');
  try {
    await invalidateDomainFacts();
  } catch (err) {
    // `cacheDel` already swallows Redis errors, so this only fires on
    // something genuinely unexpected — and even then the row WAS saved.
    // Failing the admin's write (which they would retry, hitting the
    // unique-slug index) to report a stale cache entry is strictly worse
    // than falling back to the 600s TTL.
    reportError(err, { stage: 'catalog.invalidateDomainFacts' });
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
 * Write a batch of catalog redirects, best-effort.
 *
 * Same contract as `redirectOnSlugChange` for one path — the catalog change is
 * already committed and a failed redirect must never turn a successful save
 * into a 500 the admin retries — but in a constant number of statements rather
 * than one round trip per URL. See `createRedirects`.
 */
export async function writeCatalogRedirects(entries: Array<{ fromPath: string; toPath: string }>): Promise<void> {
  if (entries.length === 0) return;
  try {
    await createRedirects(entries);
  } catch (err) {
    if (err instanceof RedirectLoopError) return;
    reportError(err, { stage: 'catalog.writeCatalogRedirects', count: entries.length });
  }
}

/**
 * A category slug is a PATH PREFIX: renaming «rebar» moves the category page,
 * every sub page beneath it, and every product page beneath those. Redirecting
 * only the node's own page would still 404 every indexed product — which is
 * where the organic traffic actually lands. So walk the descendants and
 * redirect each concrete path.
 */
export async function redirectCategorySlugChange(id: string, oldSlug: string, newSlug: string): Promise<void> {
  if (oldSlug === newSlug) return;
  const rows = await getDb()
    .select({ subSlug: subCategories.slug, skuSlug: skus.slug })
    .from(subCategories)
    .leftJoin(skus, eq(skus.subCategoryId, subCategories.id))
    .where(eq(subCategories.categoryId, id));
  const entries = [{ fromPath: routes.category(oldSlug), toPath: routes.category(newSlug) }];
  const seenSubs = new Set<string>();
  for (const r of rows) {
    if (!seenSubs.has(r.subSlug)) {
      seenSubs.add(r.subSlug);
      entries.push({
        fromPath: routes.subCategory(oldSlug, r.subSlug),
        toPath: routes.subCategory(newSlug, r.subSlug),
      });
    }
    if (r.skuSlug) {
      entries.push({
        fromPath: routes.sku(oldSlug, r.subSlug, r.skuSlug),
        toPath: routes.sku(newSlug, r.subSlug, r.skuSlug),
      });
    }
  }
  await writeCatalogRedirects(entries);
}

/**
 * The same job for a sub-category, which can move in TWO ways — and only one
 * of them was ever handled.
 *
 * `/prices/[category]/[sub]` embeds the parent category's slug, so re-parenting
 * a sub-category changes the URL of that sub AND of every product under it,
 * exactly as a rename does. The route only ever compared slugs, so a move —
 * which the panel offers, and warns about («نشانی صفحه‌شان عوض می‌شود») —
 * silently hard-404'd every indexed URL it touched: an 18-product sub is 19
 * pages of accumulated ranking dropped on the floor. The SKU route has always
 * handled its own equivalent (`moved`); this is that, one level up.
 */
export async function redirectSubCategoryChange(
  id: string,
  before: { categoryId: string; slug: string },
  after: { categoryId: string; slug: string },
): Promise<void> {
  const db = getDb();
  const catRows = await db
    .select({ id: categories.id, slug: categories.slug })
    .from(categories)
    .where(inArray(categories.id, [...new Set([before.categoryId, after.categoryId])]));
  const slugById = new Map(catRows.map((c) => [c.id, c.slug]));
  const oldCat = slugById.get(before.categoryId);
  const newCat = slugById.get(after.categoryId);
  if (!oldCat || !newCat) return;
  const from = routes.subCategory(oldCat, before.slug);
  const to = routes.subCategory(newCat, after.slug);
  if (from === to) return;
  const rows = await db.select({ slug: skus.slug }).from(skus).where(eq(skus.subCategoryId, id));
  await writeCatalogRedirects([
    { fromPath: from, toPath: to },
    ...rows.map((r) => ({
      fromPath: routes.sku(oldCat, before.slug, r.slug),
      toPath: routes.sku(newCat, after.slug, r.slug),
    })),
  ]);
}

/**
 * Every public URL a node is about to take down, and the nearest page that
 * should absorb them.
 *
 * MUST be called BEFORE the delete: the children are removed by FK cascade, so
 * after the statement there is nothing left to enumerate. Feed the result to
 * `writeCatalogRedirects` once the delete has actually succeeded.
 *
 * Deleting used to leave nothing at all — not a redirect, not a tombstone — so
 * a product page that had been indexed and linked for a year became a bare
 * 404, dropping both its own ranking and the internal links pointing at it,
 * while the confirm dialog said only that it would be «حذف». A live ancestor is
 * not a perfect destination (the ideal is the product that replaced it, which
 * nothing in the panel can express yet), but it keeps the visitor inside the
 * catalog and hands the link equity to a page that still exists.
 */
export async function planDeletedNodeRedirects(
  kind: 'category' | 'subCategory' | 'sku',
  id: string,
): Promise<Array<{ fromPath: string; toPath: string }>> {
  const db = getDb();
  if (kind === 'sku') {
    const rows = await db
      .select({ catSlug: categories.slug, subSlug: subCategories.slug, skuSlug: skus.slug })
      .from(skus)
      .innerJoin(subCategories, eq(subCategories.id, skus.subCategoryId))
      .innerJoin(categories, eq(categories.id, skus.categoryId))
      .where(eq(skus.id, id))
      .limit(1);
    const hit = rows[0];
    if (!hit) return [];
    return [
      {
        fromPath: routes.sku(hit.catSlug, hit.subSlug, hit.skuSlug),
        toPath: routes.subCategory(hit.catSlug, hit.subSlug),
      },
    ];
  }
  if (kind === 'subCategory') {
    const rows = await db
      .select({ catSlug: categories.slug, subSlug: subCategories.slug, skuSlug: skus.slug })
      .from(subCategories)
      .innerJoin(categories, eq(categories.id, subCategories.categoryId))
      .leftJoin(skus, eq(skus.subCategoryId, subCategories.id))
      .where(eq(subCategories.id, id));
    const head = rows[0];
    if (!head) return [];
    const toPath = routes.category(head.catSlug);
    const entries = [{ fromPath: routes.subCategory(head.catSlug, head.subSlug), toPath }];
    for (const r of rows) {
      if (r.skuSlug) entries.push({ fromPath: routes.sku(r.catSlug, r.subSlug, r.skuSlug), toPath });
    }
    return entries;
  }
  const rows = await db
    .select({ catSlug: categories.slug, subSlug: subCategories.slug, skuSlug: skus.slug })
    .from(categories)
    .leftJoin(subCategories, eq(subCategories.categoryId, categories.id))
    .leftJoin(skus, eq(skus.subCategoryId, subCategories.id))
    .where(eq(categories.id, id));
  const head = rows[0];
  if (!head) return [];
  // `/prices` rather than the home page: a customer who followed a link to
  // «قیمت ورق» is shopping, and the price table is the closest thing left.
  const toPath = routes.prices();
  const entries = [{ fromPath: routes.category(head.catSlug), toPath }];
  const seenSubs = new Set<string>();
  for (const r of rows) {
    if (r.subSlug && !seenSubs.has(r.subSlug)) {
      seenSubs.add(r.subSlug);
      entries.push({ fromPath: routes.subCategory(r.catSlug, r.subSlug), toPath });
    }
    if (r.subSlug && r.skuSlug) {
      entries.push({ fromPath: routes.sku(r.catSlug, r.subSlug, r.skuSlug), toPath });
    }
  }
  return entries;
}

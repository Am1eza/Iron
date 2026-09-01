/**
 * Catalog writes (admin) — CRUD where DELETE MEANS DELETE.
 *
 * There is no soft delete and no hidden state: `deleteSku`,
 * `deleteSubCategory` and `deleteCategory` remove the row, and the FK cascade
 * takes current_prices, price_points, favorites and alerts with it. Only
 * `lead_items`/`order_items` survive (ON DELETE SET NULL, keeping their frozen
 * name/price snapshot), so no quote or order loses what it was for. Nothing
 * here is recoverable from the catalog tables afterwards — which is why the
 * routes audit the WHOLE removed row and leave a redirect behind.
 * (This header claimed the exact opposite — "soft-delete only, hard deletes
 * never happen" — for as long as `961bb34` had already been deleting for real.
 * A developer trusting it would assume price history was safe and never write
 * the backup, undo or impact check that assumption removes the need for.)
 *
 * The W24 audit reshaped this layer around four defects that all surfaced to
 * the admin as either an opaque 500 or a silent no-op:
 *
 *  - every unique-slug collision escaped as a raw Postgres 23505 and became
 *    «خطایی در سرور رخ داد» — `DuplicateSlugError` now carries the offending
 *    field so the routes can answer with a 409 the form shows inline;
 *  - `updateX` returned only the NEW row, so all nine catalog audit entries
 *    were written with `before: null` and the activity log could never answer
 *    "what was it before?" — the update helpers return `{ before, after }`;
 *  - `categoryId`/`subCategoryId` were two independent client strings that
 *    nothing cross-checked, so a product could be filed under a sub belonging
 *    to a different category (a live page under a breadcrumb that 404s);
 *    `resolveSkuParent` now DERIVES the category from the sub instead;
 *  - listings gave the admin no idea what a delete would take down, hence the
 *    `*WithCounts` variants and `skuImpact`.
 */
import { and, asc, eq, ilike, inArray, or, sql, type AnyColumn } from 'drizzle-orm';
import { ulid } from 'ulid';
import { getDb, type DbOrTx } from '@/lib/server/db/client';
import {
  categories,
  subCategories,
  skus,
  factoryOrder,
  currentPrices,
  pricePoints,
  leadItems,
  leads,
  orderItems,
  orders,
  alerts,
  favorites,
} from '@/lib/server/db/schema';
import type { PriceBasis, PriceUnit, SeoMeta } from '@/lib/types/domain';
import { normalizeDigits } from '@/lib/utils/format';
import { normalizePersian } from '@/lib/utils/persianText';
import { likeContains } from '@/lib/server/utils/likeEscape';
import { foldZwnjForSearch, ZWNJ } from '@/lib/server/utils/persianZwnj';

/** A unique-index violation, translated into something a form can render.
 *  `field` names the input the message belongs next to. */
export class DuplicateSlugError extends Error {
  constructor(readonly field: 'slug', message: string) {
    super(message);
    this.name = 'DuplicateSlugError';
  }
}

/**
 * The SAME product already exists — same sub-category, name, size and factory.
 *
 * Distinct from `DuplicateSlugError`: that one is about a URL, and `freeSlug`
 * settles it silently on create because two genuinely different products in
 * two sub-categories can legitimately compose to one slug. This one is about
 * the PRODUCT, where settling silently is the bug: a double-clicked save or a
 * retried request produced «میلگرد ۱۴ A3» twice — two live pages, two rows in
 * the public price table, two targets for the price sync — and told the admin
 * both times that it had saved.
 */
export class DuplicateProductError extends Error {
  constructor(
    readonly existingId: string,
    message: string,
  ) {
    super(message);
    this.name = 'DuplicateProductError';
  }
}

/** A parent id that doesn't exist, or a sub-category that doesn't belong to
 *  the category it was filed under. */
export class InvalidParentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidParentError';
  }
}

/** Postgres unique_violation — node-postgres puts the SQLSTATE on `.code`. */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}

/** Backstop for the concurrent-insert race the pre-checks below can't close:
 *  they produce the better message, this catches the narrow window. */
async function asSlugConflict<T>(run: () => Promise<T>, message: string): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (isUniqueViolation(err)) throw new DuplicateSlugError('slug', message);
    throw err;
  }
}

/**
 * Find a free slug by suffixing -2, -3, …
 *
 * The admin is not technical, never types a slug, and must never be shown a
 * collision error about one: two products legitimately named «میلگرد ۱۴ A3»
 * in different sub-categories compose to the same slug, and the second save
 * would otherwise fail with a message the admin cannot act on. Only CREATE
 * auto-settles — an explicit slug edit still reports the conflict, because
 * there the value was chosen on purpose.
 */
async function freeSlug(base: string, taken: (slug: string) => Promise<boolean>): Promise<string> {
  if (!(await taken(base))) return base;
  for (let n = 2; n < 200; n += 1) {
    const candidate = `${base}-${n}`;
    if (!(await taken(candidate))) return candidate;
  }
  // 200 collisions means something upstream is wrong; let the unique index
  // speak rather than looping forever.
  return `${base}-${Date.now()}`;
}

/* ------------------------------ categories ------------------------------ */

/**
 * Ties in `order` are the normal case, not an edge case: create defaults every
 * new node to 99, so five categories added in a row all share it. Postgres
 * guarantees NO order between rows a sort cannot distinguish, and the plan for
 * this query legitimately changes with the table's shape — so without a second
 * key the mega-menu, the home cascade and the admin rail could each come back
 * in a different order between two ISR regenerations with nothing in the
 * database having changed. The id is the tie-break because it is the primary
 * key (a total order, always) and it is a ULID, so equal-`order` rows fall
 * back to the order they were created in.
 */
const TAXONOMY_ORDER = [asc(categories.order), asc(categories.id)] as const;
const SUB_ORDER = [asc(subCategories.order), asc(subCategories.id)] as const;

export async function adminListCategories() {
  return getDb().select().from(categories).orderBy(...TAXONOMY_ORDER);
}

/** Categories plus what sits under each — the admin has to see that «پروفیل»
 *  carries 7 sub-categories and 210 live products BEFORE the confirm dialog
 *  asks whether to delete it, because deleting takes all of them with it. */
export async function adminListCategoriesWithCounts() {
  const db = getDb();
  const [rows, subCounts, skuCounts] = await Promise.all([
    db.select().from(categories).orderBy(...TAXONOMY_ORDER),
    db
      .select({ categoryId: subCategories.categoryId, n: sql<number>`count(*)::int` })
      .from(subCategories)
      .groupBy(subCategories.categoryId),
    db
      .select({ categoryId: skus.categoryId, n: sql<number>`count(*)::int` })
      .from(skus)
      .groupBy(skus.categoryId),
  ]);
  const subsBy = new Map(subCounts.map((r) => [r.categoryId, r.n]));
  const skusBy = new Map(skuCounts.map((r) => [r.categoryId, r.n]));
  return rows.map((c) => ({ ...c, subCount: subsBy.get(c.id) ?? 0, skuCount: skusBy.get(c.id) ?? 0 }));
}

async function categorySlugTaken(slug: string, exceptId?: string): Promise<boolean> {
  const rows = await getDb().select({ id: categories.id }).from(categories).where(eq(categories.slug, slug)).limit(1);
  const hit = rows[0];
  return Boolean(hit && hit.id !== exceptId);
}

export async function createCategory(input: {
  slug: string;
  name: string;
  order?: number;
  iconId?: string;
  imageUrl?: string | null;
  seo?: SeoMeta | null;
}) {
  const slug = await freeSlug(input.slug, (c) => categorySlugTaken(c));
  const rows = await asSlugConflict(
    () =>
      getDb()
        .insert(categories)
        .values({
          id: ulid(),
          slug,
          name: input.name,
          order: input.order ?? 99,
          iconId: input.iconId ?? '',
          imageUrl: input.imageUrl ?? null,
          seo: input.seo ?? null,
        })
        .returning(),
    'این نشانی قبلاً برای دستهٔ دیگری استفاده شده است.',
  );
  return rows[0]!;
}

export async function updateCategory(
  id: string,
  patch: Partial<{
    slug: string;
    name: string;
    order: number;
    iconId: string;
    imageUrl: string | null;
    /** Replaced wholesale, not merged: the panel sends the whole blob it read,
     *  which is how the article editor already treats this column. */
    seo: SeoMeta | null;
  }>,
) {
  const db = getDb();
  const prevRows = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
  const before = prevRows[0];
  if (!before) return null;
  if (Object.keys(patch).length === 0) return { before, after: before };
  if (patch.slug && patch.slug !== before.slug && (await categorySlugTaken(patch.slug, id))) {
    throw new DuplicateSlugError('slug', 'این نشانی قبلاً برای دستهٔ دیگری استفاده شده است.');
  }
  const rows = await asSlugConflict(
    () =>
      db
        .update(categories)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(categories.id, id))
        .returning(),
    'این نشانی قبلاً برای دستهٔ دیگری استفاده شده است.',
  );
  const after = rows[0];
  return after ? { before, after } : null;
}

/* ---------------------------- sub-categories ---------------------------- */

export async function adminListSubCategories(categoryId?: string) {
  const where = categoryId ? eq(subCategories.categoryId, categoryId) : undefined;
  return getDb().select().from(subCategories).where(where).orderBy(...SUB_ORDER);
}

/** Sub-categories plus their active-SKU count — same blast-radius rationale
 *  as `adminListCategoriesWithCounts`. */
export async function adminListSubCategoriesWithCounts(categoryId?: string) {
  const db = getDb();
  const where = categoryId ? eq(subCategories.categoryId, categoryId) : undefined;
  const rows = await db.select().from(subCategories).where(where).orderBy(...SUB_ORDER);
  if (rows.length === 0) return [];
  const counts = await db
    .select({ subCategoryId: skus.subCategoryId, n: sql<number>`count(*)::int` })
    .from(skus)
    .where(
      and(
        inArray(
          skus.subCategoryId,
          rows.map((r) => r.id),
        ),
      ),
    )
    .groupBy(skus.subCategoryId);
  const by = new Map(counts.map((r) => [r.subCategoryId, r.n]));
  return rows.map((s) => ({ ...s, skuCount: by.get(s.id) ?? 0 }));
}

async function subSlugTaken(categoryId: string, slug: string, exceptId?: string): Promise<boolean> {
  const rows = await getDb()
    .select({ id: subCategories.id })
    .from(subCategories)
    .where(and(eq(subCategories.categoryId, categoryId), eq(subCategories.slug, slug)))
    .limit(1);
  const hit = rows[0];
  return Boolean(hit && hit.id !== exceptId);
}

export async function createSubCategory(input: {
  categoryId: string;
  slug: string;
  name: string;
  groupLabel?: string | null;
  order?: number;
}) {
  const parent = await getDb()
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.id, input.categoryId))
    .limit(1);
  if (!parent[0]) throw new InvalidParentError('دستهٔ انتخاب‌شده یافت نشد.');
  const slug = await freeSlug(input.slug, (c) => subSlugTaken(input.categoryId, c));
  const rows = await asSlugConflict(
    () =>
      getDb()
        .insert(subCategories)
        .values({
          id: ulid(),
          categoryId: input.categoryId,
          slug,
          name: input.name,
          groupLabel: input.groupLabel?.trim() || null,
          order: input.order ?? 99,
        })
        .returning(),
    'این نشانی قبلاً در همین دسته استفاده شده است.',
  );
  return rows[0]!;
}

export async function updateSubCategory(
  id: string,
  patch: Partial<{
    slug: string;
    name: string;
    groupLabel: string | null;
    order: number;
    categoryId: string;
  }>,
) {
  const db = getDb();
  const prevRows = await db.select().from(subCategories).where(eq(subCategories.id, id)).limit(1);
  const before = prevRows[0];
  if (!before) return null;
  // Drizzle throws "No values to set" on an empty SET, and every field here is
  // optional — so `PATCH {}` used to be a 500. Nothing to do is not an error.
  if (Object.keys(patch).length === 0) return { before, after: before };
  if (patch.categoryId && patch.categoryId !== before.categoryId) {
    const parent = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.id, patch.categoryId))
      .limit(1);
    if (!parent[0]) throw new InvalidParentError('دستهٔ مقصد یافت نشد.');
  }
  const targetCategory = patch.categoryId ?? before.categoryId;
  const targetSlug = patch.slug ?? before.slug;
  if ((patch.slug || patch.categoryId) && (await subSlugTaken(targetCategory, targetSlug, id))) {
    throw new DuplicateSlugError('slug', 'این نشانی قبلاً در دستهٔ مقصد استفاده شده است.');
  }
  // ONE transaction, because moving a sub to another category must drag its
  // products along: `skus.categoryId` disagreeing with
  // `subCategories.categoryId` puts every product of that sub on a live page
  // under a breadcrumb path that 404s, and `adminListSkus` (which joins
  // through `skus.categoryId`) stops showing them under the category they are
  // actually in — with nothing anywhere that reconciles the two. As two
  // independent UPDATEs, a dropped connection between them left exactly that,
  // permanently, however loudly the comment promised otherwise.
  const rows = await asSlugConflict(
    () =>
      db.transaction(async (tx) => {
        const updated = await tx.update(subCategories).set(patch).where(eq(subCategories.id, id)).returning();
        if (updated[0] && patch.categoryId && patch.categoryId !== before.categoryId) {
          await tx
            .update(skus)
            .set({ categoryId: patch.categoryId, updatedAt: new Date() })
            .where(eq(skus.subCategoryId, id));
        }
        return updated;
      }),
    'این نشانی قبلاً در دستهٔ مقصد استفاده شده است.',
  );
  const after = rows[0];
  if (!after) return null;
  return { before, after };
}

/* --------------------------------- SKUs --------------------------------- */

export async function adminListSkus(query: {
  categoryId?: string;
  subCategoryId?: string;
  q?: string;
  page?: number;
  perPage?: number;
}) {
  const db = getDb();
  // `Number('1e400')` is Infinity, which reached OFFSET and made Postgres
  // reject the statement as a bigint syntax error → 500.
  const rawPage = Number.isFinite(query.page) ? (query.page as number) : 1;
  const page = Math.min(100_000, Math.max(1, Math.floor(rawPage)));
  const perPage = Math.min(200, Math.max(1, Math.floor(query.perPage ?? 50)));
  const conds = [];
  if (query.categoryId) conds.push(eq(skus.categoryId, query.categoryId));
  if (query.subCategoryId) conds.push(eq(skus.subCategoryId, query.subCategoryId));
  if (query.q) {
    // The old filter matched `name` alone while the UI promised
    // «نام/اسلاگ/سایز» — an admin pasting a slug from a customer's broken URL,
    // or typing a size, got «کالایی نیست» for a product that plainly exists.
    // Trigram indexes already back `name` and `factory`.
    // Sizes and names are stored with Persian digits, but an admin on a Latin
    // keyboard types «14» — and slugs are the reverse, always ASCII. Matching
    // BOTH spellings is what makes one search box cover all six columns.
    // Every free-text column above is written through `normalizePersian`
    // (see the create/update payloads in api/admin/catalog/skus): Arabic ك/ي
    // become ک/ی, tatweel and harakat are dropped, Arabic-Indic digits become
    // Persian ones. The query was NOT, so the write and the read disagreed and
    // the box could never find what the same form had just saved — «کارخانهٔ
    // آزمایشی» is stored «کارخانه آزمایشی», because U+0654 is a harakat, and
    // ILIKE has no idea the two are the same word. That is the very failure
    // the write-side normalization exists to prevent, half-applied.
    // `raw` stays in the set beside it: rows written before that
    // normalization existed still carry the un-normalized spelling, and
    // dropping `raw` would trade one unfindable set of products for another.
    // The last spelling axis is the half-space: JS `\s` does not include ZWNJ,
    // so «ذوب آهن» and «ذوب‌آهن» are two unequal strings that render nearly
    // identically, and neither the write path nor this query used to bridge
    // them. Folding ZWNJ to a space on BOTH sides — the term below, the
    // haystack in SQL — makes them one string. It costs no extra predicates
    // and can only add matches: it is a 1:1 character substitution, so every
    // substring match that held before still holds. See utils/persianZwnj.ts.
    //
    // And the last axis of all is WORD ORDER. Everything above still built one
    // contiguous `%…%`, so the query had to be a substring of a single column
    // — but names are COMPOSED (`composeSkuName` writes «میلگرد آجدار ۱۴ ذوب
    // آهن» out of four parts), so «میلگرد ۱۴» — the most natural thing an
    // admin can type, and the exact phrasing the panel's own placeholder
    // invites — matched nothing at all while the product sat right there.
    // That is the failure that closes the loop: search says no, the admin
    // concludes the product is missing, and creates it again (see
    // `DuplicateProductError`).
    //
    // So: split on whitespace and require EVERY token to appear SOMEWHERE,
    // rather than requiring the whole phrase to appear in one place. A
    // single-word query is unchanged (one token, one predicate group); a
    // multi-word one now behaves the way every search box the admin has ever
    // used behaves. It only ever adds matches — a contiguous phrase that used
    // to match still contains all of its own tokens.
    const tokens = foldZwnjForSearch(query.q.slice(0, 100))
      .split(/\s+/)
      .filter((t) => t.length > 0)
      // A bound on the predicate count, not on the admin: eight tokens is far
      // past the longest composed name in the catalog, so anything beyond it
      // is a paste, and the tokens that survive still narrow the result.
      .slice(0, 8);
    // ONE searchable expression instead of seven, which is also what makes
    // per-token matching affordable: `concat_ws` skips NULLs and separates the
    // rest with a space, so a token can match any column without multiplying
    // the predicate count by seven. No index is lost by it — this search
    // already spanned five columns with no index at all (`slug`, `size`,
    // `grade`, `condition`, `standard`; see schema/catalog.ts), which Postgres
    // could only ever answer with a scan whatever the two trigram indexes on
    // `name` and `factory` might have offered.
    const haystack = sql`replace(concat_ws(' ', ${skus.name}, ${skus.slug}, ${skus.size}, ${skus.factory}, ${skus.grade}, ${skus.condition}, ${skus.standard}), ${ZWNJ}, ' ')`;
    for (const token of tokens) {
      // Per TOKEN, not per query: «کارخانهٔ ۱۴» needs the harakat folded out of
      // the first word and the digits re-spelled in the second, and a variant
      // set built from the whole string can only apply both to both.
      const patterns = [
        ...new Set([
          token,
          normalizePersian(token),
          token.replace(/[0-9]/g, (d) => String.fromCharCode(d.charCodeAt(0) + 0x06f0 - 0x30)),
          normalizeDigits(token),
        ]),
      ]
        .filter((t) => t.length > 0)
        .map(likeContains);
      conds.push(or(...patterns.map((p) => ilike(haystack, p))));
    }
  }
  // Every product that exists is reachable on the public site: the three
  // levels have no hidden state left to disagree about. The panel used to
  // carry a whole «مخفی» apparatus for products stranded under a deactivated
  // parent — 167 of 240 at its worst — and that condition can no longer occur.
  const where = conds.length ? and(...conds) : undefined;
  const [rows, total] = await Promise.all([
    db
      .select({
        sku: skus,
        price: currentPrices,
        subName: subCategories.name,
      })
      .from(skus)
      .innerJoin(subCategories, eq(subCategories.id, skus.subCategoryId))
      .innerJoin(categories, eq(categories.id, skus.categoryId))
      .leftJoin(currentPrices, eq(currentPrices.skuId, skus.id))
      .where(where)
      .orderBy(asc(skus.name))
      .limit(perPage)
      .offset((page - 1) * perPage),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(skus)
      .innerJoin(subCategories, eq(subCategories.id, skus.subCategoryId))
      .innerJoin(categories, eq(categories.id, skus.categoryId))
      .where(where),
  ]);
  return {
    rows: rows.map(({ sku, price, subName }) => ({ sku, price, subName })),
    total: total[0]?.n ?? 0,
    page,
    perPage,
  };
}

/** Distinct factory names already in use — feeds the form's datalist so the
 *  admin picks the existing «ذوب آهن» instead of inventing a ZWNJ variant that
 *  splits the public factory-comparison table in two. */
export async function distinctFactories(): Promise<string[]> {
  const rows = await getDb()
    .selectDistinct({ factory: skus.factory })
    .from(skus)
    .where(sql`${skus.factory} is not null and ${skus.factory} <> ''`)
    .orderBy(asc(skus.factory));
  return rows.map((r) => r.factory).filter((f): f is string => Boolean(f));
}

/**
 * Every value already in use for the free-text SKU columns, optionally scoped
 * to one category. The admin is not technical and should be PICKING, not
 * typing: it stops «ذوب آهن» becoming three spellings, and it means adding the
 * 12th rebar size is two clicks rather than recalling the house convention.
 */
export async function catalogSuggestions(categoryId?: string): Promise<{
  factories: string[];
  sizes: string[];
  grades: string[];
  conditions: string[];
  /** Shared ورق dimensions / approved نبشی thickness values already
   *  in use within the requested parent-category scope. */
  dimensions: string[];
  /** «رده» values already in use in this category, so «رده ۴۰» stays one
   *  string rather than splitting across near-identical spellings — the same
   *  "let them pick, not type" reason every other picker here is fed from the
   *  data. Empty for every category except لوله. */
  schedules: string[];
  standards: string[];
  groupLabels: string[];
}> {
  const db = getDb();
  const where = categoryId ? eq(skus.categoryId, categoryId) : undefined;
  // DISTINCT in Postgres, not in Node.
  //
  // This ran unscoped on every drawer open (the "all products" view passes no
  // category), and it selected seven columns of all 748 rows with no LIMIT and
  // no DISTINCT — ~5,200 values shipped over the wire to produce a few dozen,
  // then seven `localeCompare` sorts over the duplicates. `array_agg(distinct)`
  // does the de-duplication where the rows already are, so the same scan
  // returns seven small arrays: tens of values instead of thousands, and the
  // sort below is over the distinct set rather than the whole table.
  //
  // The sort stays in Node deliberately — Persian collation is a property of
  // the database's locale, which this code cannot assume (pglite in tests, the
  // server's own collation in production), and `localeCompare(…, 'fa')` is the
  // same ordering the rest of the panel uses.
  const distinct = (col: AnyColumn) =>
    sql<string[] | null>`array_agg(distinct ${col}) filter (where ${col} is not null and btrim(${col}) <> '')`;
  const agg = await db
    .select({
      factory: distinct(skus.factory),
      size: distinct(skus.size),
      grade: distinct(skus.grade),
      condition: distinct(skus.condition),
      dimensions: distinct(skus.dimensions),
      schedule: distinct(skus.schedule),
      standard: distinct(skus.standard),
    })
    .from(skus)
    .where(where);
  // No rows at all means every aggregate is NULL, not an empty array — a brand
  // new category must answer with empty pickers, never `null`.
  const pick = (values: string[] | null | undefined) =>
    [...new Set(values ?? [])].sort((a, b) => a.localeCompare(b, 'fa'));
  // groupLabel lives on subCategories, not skus — same "let them pick, not
  // type" rationale as factory above: a free-text cluster label is only
  // useful if «ورق رنگی» stays one string, not three near-identical spellings
  // silently splitting the group.
  const groupWhere = categoryId ? eq(subCategories.categoryId, categoryId) : undefined;
  const groupRows = await db.select({ groupLabel: subCategories.groupLabel }).from(subCategories).where(groupWhere);
  const groupLabels = [
    ...new Set(groupRows.map((r) => r.groupLabel).filter((v): v is string => Boolean(v && v.trim()))),
  ].sort((a, b) => a.localeCompare(b, 'fa'));
  const row = agg[0];
  return {
    factories: pick(row?.factory),
    sizes: pick(row?.size),
    grades: pick(row?.grade),
    conditions: pick(row?.condition),
    dimensions: pick(row?.dimensions),
    schedules: pick(row?.schedule),
    standards: pick(row?.standard),
    groupLabels,
  };
}

export interface SkuInput {
  subCategoryId: string;
  categoryId?: string;
  slug: string;
  name: string;
  standard?: string | null;
  size?: string | null;
  grade?: string | null;
  /** Product form/finish, independent of metallurgical grade. */
  condition?: string | null;
  /** Context-specific plate dimensions or section thickness. Same nullable
   *  "absent key leaves it alone, explicit null clears it" update rule. */
  dimensions?: string | null;
  /** «رده» — the pipe schedule, on لوله's pressure-pipe subs. Same nullable
   *  "absent key leaves the column alone, explicit null clears it" rule as
   *  every other optional field here. See server/db/schema/catalog.ts. */
  schedule?: string | null;
  factory?: string | null;
  /** Admin-chosen position within this SKU's own factory-grouped section on
   *  the public price page. Absent = leave alone (defaults to 0, "unranked",
   *  on insert). See server/db/schema/catalog.ts and `compareRows` in
   *  components/catalog/PriceTable.tsx. */
  order?: number;
  theoreticalWeightKg?: number | null;
  unit?: PriceUnit;
  /** What a stored price is per. Absent = leave alone (the column defaults to
   *  `'kg'`, which is what every pre-existing row always meant). */
  priceBasis?: PriceBasis;
  branchLengthM?: number | null;
  imageUrl?: string | null;
  /** Additional category IDs this SKU is ALSO listed under — its own
   *  subCategoryId/categoryId above stays the one thing that decides its URL.
   *  See catalog.ts's crossListedCategoryIds doc comment. */
  crossListedCategoryIds?: string[] | null;
}

/** Silently drops any id that isn't a real, active category rather than
 *  erroring — the admin UI only ever offers real categories to pick from, so
 *  a bad id here means stale client state (a category deactivated between
 *  page load and save), not something worth failing the whole save over.
 *  Empty result normalises to `null`, matching every other cleared-field
 *  convention in this file (an empty array and "not cross-listed" must read
 *  identically to the query in catalogRepo). */
async function sanitizeCrossListedCategoryIds(
  ids: string[] | null | undefined,
  excludeCategoryId: string,
): Promise<string[] | null> {
  if (!ids || ids.length === 0) return null;
  const rows = await getDb()
    .select({ id: categories.id })
    .from(categories)
    .where(and(inArray(categories.id, ids)));
  // A SKU cross-listed into its own home category would just show up twice
  // on the one page it already lives on — meaningless, so it's dropped
  // rather than saved and silently double-rendered.
  const valid = rows.map((r) => r.id).filter((id) => id !== excludeCategoryId);
  return valid.length > 0 ? valid : null;
}

/** A SKU's category is fully determined by its sub-category, so accepting both
 *  from the client only created a way for them to disagree. Callers pass the
 *  sub; this returns (and validates) the category. */
async function resolveSkuParent(subCategoryId: string, tx: DbOrTx = getDb()): Promise<string> {
  const rows = await tx
    .select({ categoryId: subCategories.categoryId })
    .from(subCategories)
    .where(eq(subCategories.id, subCategoryId))
    .limit(1);
  const hit = rows[0];
  if (!hit) throw new InvalidParentError('زیر‌دستهٔ انتخاب‌شده یافت نشد.');
  return hit.categoryId;
}

async function skuSlugTaken(slug: string, exceptId?: string): Promise<boolean> {
  const rows = await getDb().select({ id: skus.id }).from(skus).where(eq(skus.slug, slug)).limit(1);
  const hit = rows[0];
  return Boolean(hit && hit.id !== exceptId);
}

/**
 * The row this input would duplicate, if there is one.
 *
 * `(subCategoryId, name, size, factory)` is what makes a product distinct in
 * this catalog: everything else on the row (weight, branch length, image,
 * basis) is a property OF that product rather than part of its identity. All
 * four values arrive already normalized from the route's zod transforms, so
 * this compares like with like.
 *
 * `is null` rather than `= null` for the two nullable columns — a rebar SKU
 * with no factory recorded twice is still the same product twice.
 */
async function existingProduct(input: SkuInput): Promise<{ id: string; slug: string } | null> {
  const rows = await getDb()
    .select({ id: skus.id, slug: skus.slug })
    .from(skus)
    .where(
      and(
        eq(skus.subCategoryId, input.subCategoryId),
        eq(skus.name, input.name),
        input.size == null ? sql`${skus.size} is null` : eq(skus.size, input.size),
        input.factory == null ? sql`${skus.factory} is null` : eq(skus.factory, input.factory),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function createSku(input: SkuInput) {
  const categoryId = await resolveSkuParent(input.subCategoryId);
  // Before `freeSlug`, not after: the slug suffix is exactly the mechanism
  // that used to turn a duplicate submission into a second product.
  const duplicate = await existingProduct(input);
  if (duplicate) {
    throw new DuplicateProductError(
      duplicate.id,
      'همین کالا (با همین نام، سایز و کارخانه) در این زیر‌دسته وجود دارد.',
    );
  }
  const slug = await freeSlug(input.slug, (c) => skuSlugTaken(c));
  const crossListedCategoryIds = await sanitizeCrossListedCategoryIds(input.crossListedCategoryIds, categoryId);
  const rows = await asSlugConflict(
    () =>
      getDb()
        .insert(skus)
        .values({ ...input, id: ulid(), slug, categoryId, unit: input.unit ?? 'kg', crossListedCategoryIds })
        .returning(),
    'این نشانی قبلاً برای کالای دیگری استفاده شده است.',
  );
  return rows[0]!;
}

export async function updateSku(id: string, patch: Partial<SkuInput>) {
  const db = getDb();
  const prevRows = await db.select().from(skus).where(eq(skus.id, id)).limit(1);
  const before = prevRows[0];
  if (!before) return null;
  if (Object.keys(patch).length === 0) return { before, after: before };
  const next = { ...patch };
  // Moving a product: the destination sub decides the category, so a client
  // cannot desynchronise the pair even by sending a contradictory categoryId.
  if (patch.subCategoryId && patch.subCategoryId !== before.subCategoryId) {
    next.categoryId = await resolveSkuParent(patch.subCategoryId);
  } else {
    delete next.categoryId;
  }
  // Only touches the column when the admin actually sent this key — same
  // "absent key = leave alone, explicit null = clear" rule as every other
  // nullable field here.
  if ('crossListedCategoryIds' in patch) {
    next.crossListedCategoryIds = await sanitizeCrossListedCategoryIds(
      patch.crossListedCategoryIds,
      next.categoryId ?? before.categoryId,
    );
  } else if (next.categoryId && next.categoryId !== before.categoryId) {
    // A move re-runs the sanitize even though the client sent no such key:
    // dropping the SKU's own home category is the whole job of that helper,
    // and the home category is precisely what just changed. Without this, a
    // product cross-listed into «استیل» and then moved INTO an استیل sub keeps
    // «استیل» in the array, so `categoryId === crossListedCategoryIds[0]` and
    // the public استیل page renders the same product twice.
    next.crossListedCategoryIds = await sanitizeCrossListedCategoryIds(
      before.crossListedCategoryIds,
      next.categoryId,
    );
  }
  if (patch.slug && patch.slug !== before.slug && (await skuSlugTaken(patch.slug, id))) {
    throw new DuplicateSlugError('slug', 'این نشانی قبلاً برای کالای دیگری استفاده شده است.');
  }
  // `current_prices.unit`/`price_basis` are only rewritten on the NEXT price
  // save, and `toPriceRow` PREFERS them over the `skus` columns — so the two
  // have to move together or the public page quotes a real price against the
  // wrong denomination. Correcting a SKU from «per kilogram» to «per کلاف»
  // and losing the second statement leaves «تومان / کیلوگرم» under a per-coil
  // number until somebody happens to re-save the price: a wrong price quoted
  // to a customer, from a save the admin was told succeeded. One transaction,
  // and one UPDATE instead of two, so there is no in-between state to land in.
  const rows = await asSlugConflict(
    () =>
      db.transaction(async (tx) => {
        const updated = await tx
          .update(skus)
          .set({ ...next, updatedAt: new Date() })
          .where(eq(skus.id, id))
          .returning();
        const pricePatch: { unit?: PriceUnit; priceBasis?: PriceBasis } = {};
        if (patch.unit && patch.unit !== before.unit) pricePatch.unit = patch.unit;
        if (patch.priceBasis && patch.priceBasis !== before.priceBasis) pricePatch.priceBasis = patch.priceBasis;
        if (updated[0] && Object.keys(pricePatch).length > 0) {
          await tx.update(currentPrices).set(pricePatch).where(eq(currentPrices.skuId, id));
        }
        return updated;
      }),
    'این نشانی قبلاً برای کالای دیگری استفاده شده است.',
  );
  const after = rows[0];
  if (!after) return null;
  return { before, after };
}

/**
 * Delete a product for real, returning the row that was removed so the caller
 * can name it in the audit log.
 *
 * The structural children (current_prices, price_points, favorites, alerts,
 * price_sync_entries) cascade; `lead_items` and `order_items` are ON DELETE
 * SET NULL and keep the frozen name/price snapshot they took at the time, so
 * no quote or order loses what it was for. See schemaCascade.test.ts.
 */
export async function deleteSku(id: string) {
  const rows = await getDb().delete(skus).where(eq(skus.id, id)).returning();
  return rows[0] ?? null;
}

/** Delete a sub-category and, by cascade, every product under it. */
export async function deleteSubCategory(id: string) {
  const rows = await getDb().delete(subCategories).where(eq(subCategories.id, id)).returning();
  return rows[0] ?? null;
}

/** Delete a category and, by cascade, its sub-categories and their products. */
export async function deleteCategory(id: string) {
  const rows = await getDb().delete(categories).where(eq(categories.id, id)).returning();
  return rows[0] ?? null;
}

/**
 * What deleting a catalog node would actually destroy.
 *
 * One shape for all three levels, because the question the admin is answering
 * is the same one at each: removing something that sits in three open deals is
 * a different decision from removing something nobody has ever asked about.
 *
 * Scoped by a predicate over `skus` rather than by a list of ids: «ورق» takes
 * 19 sub-categories and hundreds of products with it, and shipping those ids
 * to the client to count them there is how the old dialog ended up quoting
 * numbers that were minutes stale.
 */
export type CatalogImpact = {
  /** Products removed — 1 for a SKU, the whole subtree for a taxonomy node. */
  skus: number;
  /** Sub-categories removed. Always 0 below category level. */
  subCategories: number;
  /**
   * Rows of `price_points` that go with them.
   *
   * This is the number that changes minds and the one the dialog never had:
   * `hasPrice` was a BOOLEAN, so eighteen months of series behind a public
   * chart and a product priced once yesterday read identically.
   */
  pricePoints: number;
  /** Products carrying a published price right now. */
  pricedSkus: number;
  openLeads: number;
  /**
   * Leads already WON on these products. Counted separately and never folded
   * into `openLeads`, which only ever meant `new`/`contacted` — a closed sale
   * is the strongest reason not to delete something, and it was the one class
   * of lead the impact check stayed silent about.
   */
  wonLeads: number;
  openOrders: number;
  activeAlerts: number;
  favorites: number;
};

const OPEN_LEAD_STATUSES = ['new', 'contacted'] as const;
const OPEN_ORDER_STATUSES = ['registered', 'confirmed', 'loading', 'in_transit'] as const;

/** `skus.id` for everything a delete at this node would take down. */
function impactScope(scope: { sku: string } | { sub: string } | { category: string }) {
  if ('sku' in scope) return eq(skus.id, scope.sku);
  if ('sub' in scope) return eq(skus.subCategoryId, scope.sub);
  return eq(skus.categoryId, scope.category);
}

async function catalogImpact(
  scope: { sku: string } | { sub: string } | { category: string },
): Promise<CatalogImpact> {
  const db = getDb();
  // A sub-select of the affected ids, evaluated once per count by Postgres
  // rather than materialized here — a category delete must not pull hundreds
  // of ids through the app just to count what hangs off them.
  const scoped = db.select({ id: skus.id }).from(skus).where(impactScope(scope));
  const inScope = (col: AnyColumn) => inArray(col, scoped);
  const count = sql<number>`count(*)::int`;

  const [skuRows, subRows, pointRows, pricedRows, openLeadRows, wonLeadRows, orderRows, alertRows, favRows] =
    await Promise.all([
      db.select({ n: count }).from(skus).where(impactScope(scope)),
      'category' in scope
        ? db.select({ n: count }).from(subCategories).where(eq(subCategories.categoryId, scope.category))
        : Promise.resolve([{ n: 0 }]),
      db.select({ n: count }).from(pricePoints).where(inScope(pricePoints.skuId)),
      db.select({ n: count }).from(currentPrices).where(inScope(currentPrices.skuId)),
      db
        .select({ n: count })
        .from(leadItems)
        .innerJoin(leads, eq(leadItems.leadId, leads.id))
        .where(and(inScope(leadItems.skuId), inArray(leads.status, [...OPEN_LEAD_STATUSES]))),
      db
        .select({ n: count })
        .from(leadItems)
        .innerJoin(leads, eq(leadItems.leadId, leads.id))
        .where(and(inScope(leadItems.skuId), eq(leads.status, 'won'))),
      db
        .select({ n: count })
        .from(orderItems)
        .innerJoin(orders, eq(orderItems.orderId, orders.id))
        .where(and(inScope(orderItems.skuId), inArray(orders.status, [...OPEN_ORDER_STATUSES]))),
      db
        .select({ n: count })
        .from(alerts)
        .where(and(inScope(alerts.skuId), eq(alerts.status, 'active'))),
      db.select({ n: count }).from(favorites).where(inScope(favorites.skuId)),
    ]);

  return {
    skus: skuRows[0]?.n ?? 0,
    subCategories: subRows[0]?.n ?? 0,
    pricePoints: pointRows[0]?.n ?? 0,
    pricedSkus: pricedRows[0]?.n ?? 0,
    openLeads: openLeadRows[0]?.n ?? 0,
    wonLeads: wonLeadRows[0]?.n ?? 0,
    openOrders: orderRows[0]?.n ?? 0,
    activeAlerts: alertRows[0]?.n ?? 0,
    favorites: favRows[0]?.n ?? 0,
  };
}

/** What deleting this product would disturb. */
export function skuImpact(id: string): Promise<CatalogImpact> {
  return catalogImpact({ sku: id });
}

/** What deleting this sub-category would disturb, products included. */
export function subCategoryImpact(id: string): Promise<CatalogImpact> {
  return catalogImpact({ sub: id });
}

/**
 * What deleting this category would disturb — its sub-categories, every
 * product under them, and their price history.
 *
 * The confirm dialog used to quote `category.skuCount` off the list the
 * browser happened to be holding, so a category showing «۰ کالا» could take
 * 210 products with it if anything had been filed under it since the page
 * loaded.
 */
export function categoryImpact(id: string): Promise<CatalogImpact> {
  return catalogImpact({ category: id });
}

/**
 * Bulk reorder in ONE transaction.
 *
 * The UI fired N independent PATCHes off a client-side snapshot: two admins
 * reordering the same list interleaved into an order neither chose, a partial
 * failure left duplicate/gapped `order` values published to the public nav, and
 * each PATCH separately wrote an audit row and purged the whole root-layout
 * cache — moving one row in a list of 18 cost 18 of each. This function was
 * written to fix exactly that and then was never wired to a route; it is
 * reachable now (`PUT /api/admin/catalog/reorder`).
 *
 * Returns the rows as they WERE alongside what was applied, so the single
 * audit entry can answer "what was the order before?" — the same thing
 * `factory-order` records, and the only way a bad drag is undoable.
 * Ids that do not exist are skipped rather than failing the batch: a stale
 * client snapshot listing a node another admin has since deleted should still
 * apply the positions of the nodes that are still there.
 */
export async function reorderTaxonomy(
  kind: 'category' | 'subCategory',
  items: Array<{ id: string; order: number }>,
  /** Sub-categories only: the parent whose children are being arranged. Ids
   *  belonging to any other category are skipped, so one category's rail can
   *  never renumber another's. */
  scopeCategoryId?: string,
): Promise<{ before: Array<{ id: string; order: number }>; after: Array<{ id: string; order: number }> }> {
  if (items.length === 0) return { before: [], after: [] };
  const db = getDb();
  const ids = items.map((it) => it.id);
  return db.transaction(async (tx) => {
    const before =
      kind === 'category'
        ? await tx
            .select({ id: categories.id, order: categories.order })
            .from(categories)
            .where(inArray(categories.id, ids))
        : await tx
            .select({ id: subCategories.id, order: subCategories.order })
            .from(subCategories)
            .where(
              scopeCategoryId
                ? and(inArray(subCategories.id, ids), eq(subCategories.categoryId, scopeCategoryId))
                : inArray(subCategories.id, ids),
            );
    const known = new Set(before.map((r) => r.id));
    const after: Array<{ id: string; order: number }> = [];
    for (const it of items) {
      if (!known.has(it.id)) continue;
      if (kind === 'category') await tx.update(categories).set({ order: it.order }).where(eq(categories.id, it.id));
      else await tx.update(subCategories).set({ order: it.order }).where(eq(subCategories.id, it.id));
      after.push(it);
    }
    return { before, after };
  });
}

/* --------------------------- factory ordering --------------------------- */

export interface AdminFactoryOrderRow {
  factory: string;
  /** 1-based position when the admin has placed it; null when it has never
   *  been ordered and therefore falls into the price-sorted tail on the
   *  public page. */
  order: number | null;
  /** Active SKUs of this category carrying that factory name. Zero means the
   *  row is a leftover: the factory was ordered once and every product of it
   *  has since been renamed or retired. Shown rather than hidden so the admin
   *  can see (and by reordering, clear) the stale entry. */
  skuCount: number;
}

/**
 * The factory list for one category's price page, in the order the public
 * site will render it.
 *
 * The union of two sets, because either alone is wrong: the DISTINCT factories
 * of the category's active SKUs (the only rows a customer can actually see)
 * plus any stored order row (so a stale entry is visible instead of silently
 * steering a sort nobody can find). Ordered rows first by `order`, then the
 * never-ordered ones alphabetically — the admin panel is a list to arrange,
 * not a price table, so it does NOT mirror the public page's cheapest-first
 * tie-break.
 */
export async function factoriesForCategory(categoryId: string): Promise<AdminFactoryOrderRow[]> {
  const db = getDb();
  const [skuRows, orderRows] = await Promise.all([
    db
      .select({ factory: skus.factory, n: sql<number>`count(*)::int` })
      .from(skus)
      .where(
        and(
          eq(skus.categoryId, categoryId),
          sql`${skus.factory} is not null and ${skus.factory} <> ''`,
        ),
      )
      .groupBy(skus.factory),
    db
      .select({ factory: factoryOrder.factory, order: factoryOrder.order })
      .from(factoryOrder)
      .where(eq(factoryOrder.categoryId, categoryId)),
  ]);
  const counts = new Map<string, number>();
  for (const r of skuRows) if (r.factory) counts.set(r.factory, r.n);
  const orders = new Map(orderRows.map((r) => [r.factory, r.order]));
  const names = new Set([...counts.keys(), ...orders.keys()]);
  return [...names]
    .map((factory) => ({
      factory,
      order: orders.get(factory) ?? null,
      skuCount: counts.get(factory) ?? 0,
    }))
    .sort((a, b) => {
      if (a.order !== null && b.order !== null) return a.order - b.order;
      if (a.order !== null) return -1;
      if (b.order !== null) return 1;
      return a.factory.localeCompare(b.factory, 'fa');
    });
}

/**
 * Replace one category's whole factory order in a single transaction.
 *
 * Replace, not upsert: the panel always submits the complete visible list, so
 * a name missing from `factories` is one the admin deliberately dropped (or a
 * stale row they just cleared), and leaving it behind would keep steering a
 * sort that no longer appears anywhere in the UI. Scoped strictly to this
 * category — no other category's rows are touched.
 *
 * One transaction for the same reason `reorderTaxonomy` is: two admins
 * arranging the same category must not interleave into an order neither of
 * them chose.
 */
export async function setFactoryOrder(categoryId: string, factories: string[]): Promise<number> {
  const db = getDb();
  // `factory_order.category_id` is a FK, so a stale id (a category another
  // admin just deleted, or client state from before a reload) reached Postgres
  // and came back as SQLSTATE 23503 — which this route, alone among the six,
  // turned into «خطایی در سرور رخ داد» with no code the panel could branch on.
  // The same id answers 200 with an empty list on GET; one of the two had to
  // give, and an actionable 400 is the one the admin can do something about.
  const parent = await db.select({ id: categories.id }).from(categories).where(eq(categories.id, categoryId)).limit(1);
  if (!parent[0]) throw new InvalidParentError('دستهٔ انتخاب‌شده یافت نشد.');
  // De-duplicate defensively: the unique index would reject a repeat anyway,
  // and a 23505 here is not a duplicate-SLUG error the forms know how to show.
  const clean = [...new Set(factories.map((f) => f.trim()).filter((f) => f !== ''))];
  return db.transaction(async (tx) => {
    await tx.delete(factoryOrder).where(eq(factoryOrder.categoryId, categoryId));
    if (clean.length > 0) {
      await tx.insert(factoryOrder).values(
        clean.map((factory, i) => ({
          id: ulid(),
          categoryId,
          factory,
          order: i + 1,
        })),
      );
    }
    return clean.length;
  });
}

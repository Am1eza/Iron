/**
 * Catalog writes (admin) — CRUD with soft-delete only. Hard deletes never
 * happen: priced SKUs keep their history forever (data-model §9).
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
 *  - listings gave the admin no idea what a soft-delete would take down,
 *    hence the `*WithCounts` variants and `skuImpact`.
 */
import { and, asc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import { getDb, type DbOrTx } from '@/lib/server/db/client';
import {
  categories,
  subCategories,
  skus,
  factoryOrder,
  currentPrices,
  leadItems,
  leads,
  orderItems,
  orders,
  alerts,
  favorites,
} from '@/lib/server/db/schema';
import type { PriceBasis, PriceUnit, SeoMeta } from '@/lib/types/domain';
import { normalizeDigits } from '@/lib/utils/format';
import { likeContains } from '@/lib/server/utils/likeEscape';

/** A unique-index violation, translated into something a form can render.
 *  `field` names the input the message belongs next to. */
export class DuplicateSlugError extends Error {
  constructor(readonly field: 'slug', message: string) {
    super(message);
    this.name = 'DuplicateSlugError';
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

export async function adminListCategories() {
  return getDb().select().from(categories).orderBy(asc(categories.order));
}

/** Categories plus what sits under each — the admin has to see that «پروفیل»
 *  carries 7 sub-categories and 210 live products BEFORE the confirm dialog
 *  asks whether to hide it. */
export async function adminListCategoriesWithCounts() {
  const db = getDb();
  const [rows, subCounts, skuCounts] = await Promise.all([
    db.select().from(categories).orderBy(asc(categories.order)),
    db
      .select({ categoryId: subCategories.categoryId, n: sql<number>`count(*)::int` })
      .from(subCategories)
      .where(eq(subCategories.isActive, true))
      .groupBy(subCategories.categoryId),
    db
      .select({ categoryId: skus.categoryId, n: sql<number>`count(*)::int` })
      .from(skus)
      .where(eq(skus.isActive, true))
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
    isActive: boolean;
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
  return getDb().select().from(subCategories).where(where).orderBy(asc(subCategories.order));
}

/** Sub-categories plus their active-SKU count — same blast-radius rationale
 *  as `adminListCategoriesWithCounts`. */
export async function adminListSubCategoriesWithCounts(categoryId?: string) {
  const db = getDb();
  const where = categoryId ? eq(subCategories.categoryId, categoryId) : undefined;
  const rows = await db.select().from(subCategories).where(where).orderBy(asc(subCategories.order));
  if (rows.length === 0) return [];
  const counts = await db
    .select({ subCategoryId: skus.subCategoryId, n: sql<number>`count(*)::int` })
    .from(skus)
    .where(
      and(
        eq(skus.isActive, true),
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
    isActive: boolean;
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
  const rows = await asSlugConflict(
    () => db.update(subCategories).set(patch).where(eq(subCategories.id, id)).returning(),
    'این نشانی قبلاً در دستهٔ مقصد استفاده شده است.',
  );
  const after = rows[0];
  if (!after) return null;
  // Moving a sub to another category must drag its products along, or
  // `skus.categoryId` silently disagrees with `subCategories.categoryId` and
  // those products render under a breadcrumb path that 404s.
  if (patch.categoryId && patch.categoryId !== before.categoryId) {
    await db
      .update(skus)
      .set({ categoryId: patch.categoryId, updatedAt: new Date() })
      .where(eq(skus.subCategoryId, id));
  }
  return { before, after };
}

/* --------------------------------- SKUs --------------------------------- */

export async function adminListSkus(query: {
  categoryId?: string;
  subCategoryId?: string;
  q?: string;
  includeInactive?: boolean;
  status?: 'active' | 'inactive';
  /** 'hidden' → only products the public site cannot show because their
   *  sub-category or category is deactivated underneath them. */
  visibility?: 'hidden';
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
  if (query.status === 'active') conds.push(eq(skus.isActive, true));
  else if (query.status === 'inactive') conds.push(eq(skus.isActive, false));
  else if (!query.includeInactive) conds.push(eq(skus.isActive, true));
  if (query.q) {
    // The old filter matched `name` alone while the UI promised
    // «نام/اسلاگ/سایز» — an admin pasting a slug from a customer's broken URL,
    // or typing a size, got «کالایی نیست» for a product that plainly exists.
    // Trigram indexes already back `name` and `factory`.
    // Sizes and names are stored with Persian digits, but an admin on a Latin
    // keyboard types «14» — and slugs are the reverse, always ASCII. Matching
    // BOTH spellings is what makes one search box cover all six columns.
    const raw = query.q.slice(0, 100).trim();
    const asPersian = raw.replace(/[0-9]/g, (d) => String.fromCharCode(d.charCodeAt(0) + 0x06f0 - 0x30));
    const asLatin = normalizeDigits(raw);
    const terms = [...new Set([raw, asPersian, asLatin])].map(likeContains);
    conds.push(
      or(
        ...terms.flatMap((term) => [
          ilike(skus.name, term),
          ilike(skus.slug, term),
          ilike(skus.size, term),
          ilike(skus.factory, term),
          ilike(skus.grade, term),
          ilike(skus.condition, term),
          ilike(skus.standard, term),
        ]),
      ),
    );
  }
  // A product is only reachable on the public site when all THREE levels are
  // active — every read path filters on `is_active` at category, sub-category
  // and SKU. The panel used to report the SKU's own flag alone, so a product
  // stranded on a retired sub-category showed a green «فعال» badge while
  // nothing on the site could reach it. That is how 167 of 240 products went
  // missing for weeks without the panel ever saying a word.
  if (query.visibility === 'hidden') {
    conds.push(or(eq(subCategories.isActive, false), eq(categories.isActive, false))!);
  }
  const where = conds.length ? and(...conds) : undefined;
  const [rows, total, hiddenTotal] = await Promise.all([
    db
      .select({
        sku: skus,
        price: currentPrices,
        subActive: subCategories.isActive,
        categoryActive: categories.isActive,
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
    // Catalog-wide, deliberately ignoring every other filter: this is the
    // number that has to be visible on the screen at all times, because an
    // admin has no reason to click a filter for a problem nobody told them
    // they have.
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(skus)
      .innerJoin(subCategories, eq(subCategories.id, skus.subCategoryId))
      .innerJoin(categories, eq(categories.id, skus.categoryId))
      .where(
        and(
          eq(skus.isActive, true),
          or(eq(subCategories.isActive, false), eq(categories.isActive, false)),
        ),
      ),
  ]);
  return {
    rows: rows.map(({ sku, price, subActive, categoryActive, subName }) => ({
      sku,
      price,
      visibleOnSite: sku.isActive && subActive && categoryActive,
      hiddenReason: !sku.isActive
        ? null
        : !categoryActive
          ? ('category' as const)
          : !subActive
            ? ('sub' as const)
            : null,
      subName,
    })),
    total: total[0]?.n ?? 0,
    hiddenTotal: hiddenTotal[0]?.n ?? 0,
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
  const rows = await db
    .select({
      factory: skus.factory,
      size: skus.size,
      grade: skus.grade,
      condition: skus.condition,
      dimensions: skus.dimensions,
      schedule: skus.schedule,
      standard: skus.standard,
    })
    .from(skus)
    .where(where);
  const pick = (get: (r: (typeof rows)[number]) => string | null) =>
    [...new Set(rows.map(get).filter((v): v is string => Boolean(v && v.trim())))].sort((a, b) =>
      a.localeCompare(b, 'fa'),
    );
  // groupLabel lives on subCategories, not skus — same "let them pick, not
  // type" rationale as factory above: a free-text cluster label is only
  // useful if «ورق رنگی» stays one string, not three near-identical spellings
  // silently splitting the group.
  const groupWhere = categoryId ? eq(subCategories.categoryId, categoryId) : undefined;
  const groupRows = await db.select({ groupLabel: subCategories.groupLabel }).from(subCategories).where(groupWhere);
  const groupLabels = [
    ...new Set(groupRows.map((r) => r.groupLabel).filter((v): v is string => Boolean(v && v.trim()))),
  ].sort((a, b) => a.localeCompare(b, 'fa'));
  return {
    factories: pick((r) => r.factory),
    sizes: pick((r) => r.size),
    grades: pick((r) => r.grade),
    conditions: pick((r) => r.condition),
    dimensions: pick((r) => r.dimensions),
    schedules: pick((r) => r.schedule),
    standards: pick((r) => r.standard),
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
  /** ورق only — plate width×length. Same nullable "absent key leaves the
   *  column alone, explicit null clears it" rule as every other optional
   *  field here. See server/db/schema/catalog.ts. */
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
    .where(and(inArray(categories.id, ids), eq(categories.isActive, true)));
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

export async function createSku(input: SkuInput) {
  const categoryId = await resolveSkuParent(input.subCategoryId);
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

export async function updateSku(id: string, patch: Partial<SkuInput> & { isActive?: boolean }) {
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
  }
  if (patch.slug && patch.slug !== before.slug && (await skuSlugTaken(patch.slug, id))) {
    throw new DuplicateSlugError('slug', 'این نشانی قبلاً برای کالای دیگری استفاده شده است.');
  }
  const rows = await asSlugConflict(
    () =>
      db
        .update(skus)
        .set({ ...next, updatedAt: new Date() })
        .where(eq(skus.id, id))
        .returning(),
    'این نشانی قبلاً برای کالای دیگری استفاده شده است.',
  );
  const after = rows[0];
  if (!after) return null;
  // `current_prices.unit` is only rewritten on the NEXT price save, and
  // `toPriceRow` prefers it over `skus.unit` — without this the public table
  // would keep showing the old unit against the new one on the detail page.
  if (patch.unit && patch.unit !== before.unit) {
    await db.update(currentPrices).set({ unit: patch.unit }).where(eq(currentPrices.skuId, id));
  }
  // Same reasoning one column over, and it matters more: `toPriceRow` prefers
  // `current_prices.price_basis`, so correcting a SKU from «per kilogram» to
  // «per کلاف» without this would leave the public caption still saying
  // «تومان / کیلوگرم» until somebody happened to re-save the price.
  if (patch.priceBasis && patch.priceBasis !== before.priceBasis) {
    await db
      .update(currentPrices)
      .set({ priceBasis: patch.priceBasis })
      .where(eq(currentPrices.skuId, id));
  }
  return { before, after };
}

/** Soft-delete (isActive=false). Hard delete is intentionally not implemented. */
export async function deactivateSku(id: string) {
  return updateSku(id, { isActive: false });
}

/** What hiding this product would actually disturb. Shown in the confirm
 *  dialog: retiring a SKU that sits in three open deals is a different
 *  decision from retiring one nobody has ever asked about. */
export async function skuImpact(id: string): Promise<{
  openLeads: number;
  openOrders: number;
  activeAlerts: number;
  favorites: number;
  hasPrice: boolean;
}> {
  const db = getDb();
  const [leadRows, orderRows, alertRows, favRows, priceRows] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(leadItems)
      .innerJoin(leads, eq(leadItems.leadId, leads.id))
      .where(and(eq(leadItems.skuId, id), inArray(leads.status, ['new', 'contacted']))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(
        and(eq(orderItems.skuId, id), inArray(orders.status, ['registered', 'confirmed', 'loading', 'in_transit'])),
      ),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(alerts)
      .where(and(eq(alerts.skuId, id), eq(alerts.status, 'active'))),
    db.select({ n: sql<number>`count(*)::int` }).from(favorites).where(eq(favorites.skuId, id)),
    db.select({ skuId: currentPrices.skuId }).from(currentPrices).where(eq(currentPrices.skuId, id)).limit(1),
  ]);
  return {
    openLeads: leadRows[0]?.n ?? 0,
    openOrders: orderRows[0]?.n ?? 0,
    activeAlerts: alertRows[0]?.n ?? 0,
    favorites: favRows[0]?.n ?? 0,
    hasPrice: Boolean(priceRows[0]),
  };
}

/** Bulk reorder in ONE transaction. The old UI fired N independent PATCHes off
 *  a client-side snapshot: two admins reordering the same list interleaved
 *  into an order neither chose, and each PATCH separately purged the whole
 *  root-layout cache. */
export async function reorderTaxonomy(
  kind: 'category' | 'subCategory',
  items: Array<{ id: string; order: number }>,
): Promise<number> {
  if (items.length === 0) return 0;
  const db = getDb();
  return db.transaction(async (tx) => {
    for (const it of items) {
      if (kind === 'category') await tx.update(categories).set({ order: it.order }).where(eq(categories.id, it.id));
      else await tx.update(subCategories).set({ order: it.order }).where(eq(subCategories.id, it.id));
    }
    return items.length;
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
          eq(skus.isActive, true),
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

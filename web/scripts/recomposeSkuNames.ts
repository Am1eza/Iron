/**
 * One-off, re-runnable repair: strip the COMPOUND category label that the
 * seeder glued onto 59 live product names.
 *
 * `src/lib/mock/catalogData.ts` composed every seeded row as
 * `${categoryName} ${subCategoryName} ${size}`. Under a single-noun category
 * that reads correctly — «میلگرد» + «آجدار A3» + «۱۴» is «میلگرد آجدار A3 ۱۴»,
 * which is what ~500 rows say and what a customer calls the product. Under a
 * COMPOUND category name it does not: «نبشی و ناودانی» and «کلاف و مفتول» are
 * shelf labels naming two product lines each, and the sub-category beneath
 * already carries whichever half applies. The result shipped to the public
 * price table as «نبشی و ناودانی ناودانی سنگین ۱۰» and «کلاف و مفتول توری ۱۰»
 * — one half restated, the other contradicted (a توری is neither a کلاف nor a
 * مفتول).
 *
 * The generator is fixed in the same change (`composeCatalogSkuName`), so no
 * new row can be born with the defect. This repairs the rows already stored.
 *
 * Scope discipline
 * ----------------
 * A row is rewritten ONLY when its stored name literally opens with its own
 * COMPOUND category name — «نبشی و ناودانی …», «کلاف و مفتول …» — and the
 * rest of the name survives on its own. That is the whole defect and nothing
 * else is touched: a single-noun category's prefix is correct and stays
 * («میلگرد آجدار A3 ۱۴»), and anything an admin or a later script authored by
 * hand («تیرآهن هاش سبک (HEA) ۲۰», «لوله آلومینیوم ۸۰ میلی‌متر ضخامت ۳
 * میلی‌متر») never had the prefix to begin with.
 *
 * Deliberately NOT «recompose every name from category + sub-category + size»:
 * `nabshi` was later renamed from «نبشی بال مساوی» to «نبشی», so recomposing
 * would also rewrite its seven SKUs from «نبشی بال مساوی ۱۰» down to «نبشی
 * ۱۰» and lose the equal-leg qualifier that distinguishes them from the
 * بال نامساوی rows beside them. Stripping the prefix changes only what is
 * wrong.
 *
 * Slugs, ids and URLs are NOT touched: `skus.slug` is composed from what the
 * product IS (`composeSkuSlug`) and never contained the category label, so no
 * URL changes and no redirect is needed.
 *
 * Run (no node on the host — see CLAUDE.md §4):
 *   docker run --rm --network ahantime_default --env-file /opt/ahantime/.env \
 *     -v /opt/ahantime:/app -w /app/web node:20 \
 *     ./node_modules/.bin/tsx scripts/recomposeSkuNames.ts
 *   # …review the report, then re-run with --apply
 *
 * Idempotent: once rewritten, a row no longer matches the old formula and is
 * skipped, so a second run reports zero changes.
 */
import pg from 'pg';

const APPLY = process.argv.includes('--apply');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[recompose-names] DATABASE_URL is not set.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url, max: 1 });

type Row = {
  id: string;
  slug: string;
  name: string;
  size: string | null;
  cat_name: string;
  sub_name: string;
  cat_slug: string;
  sub_slug: string;
};

const { rows } = await pool.query<Row>(`
  SELECT k.id, k.slug, k.name, k.size,
         c.name AS cat_name, c.slug AS cat_slug,
         s.name AS sub_name, s.slug AS sub_slug
  FROM skus k
  JOIN categories c ON c.id = k.category_id
  JOIN sub_categories s ON s.id = k.sub_category_id
  ORDER BY c.slug, s.slug, k.slug
`);

/**
 * «X و Y» — a compound category label naming two product lines. The
 * sub-category under it already carries whichever half applies, which is why
 * gluing the label in front produced «کلاف و مفتول توری ۱۰».
 */
const isCompound = (categoryName: string) => /\sو\s/.test(categoryName.trim());

const changes = rows
  .map((r) => {
    const cat = r.cat_name.trim();
    if (!isCompound(cat)) return null;
    const prefix = `${cat} `;
    if (!r.name.startsWith(prefix)) return null;
    const to = r.name.slice(prefix.length).trim();
    // A name that is ONLY the category label has nothing left to say once the
    // label goes; leave it for a human rather than blanking it.
    if (!to) return null;
    return { row: r, from: r.name, to };
  })
  .filter((c): c is { row: Row; from: string; to: string } => c !== null);

console.log(`\n[recompose-names] ${rows.length} sku(s) read; ${changes.length} to rewrite:`);
for (const c of changes) {
  console.log(`  · ${c.row.cat_slug}/${c.row.sub_slug}  ${c.row.slug}`);
  console.log(`      «${c.from}»  →  «${c.to}»`);
}

const compoundRows = rows.filter((r) => isCompound(r.cat_name)).length;
console.log(
  `\n[recompose-names] ${compoundRows - changes.length} row(s) under a compound category already read correctly — unchanged.`,
);

if (!changes.length) {
  console.log('[recompose-names] Nothing to do.');
  await pool.end();
  process.exit(0);
}

if (!APPLY) {
  console.log('\n[recompose-names] DRY RUN — no writes made. Re-run with --apply to write.');
  await pool.end();
  process.exit(0);
}

const client = await pool.connect();
try {
  await client.query('BEGIN');
  for (const c of changes) {
    // Guarded on the OLD name as well as the id, so a concurrent admin rename
    // between the read above and this write wins rather than being clobbered.
    await client.query(`UPDATE skus SET name = $1, updated_at = now() WHERE id = $2 AND name = $3`, [
      c.to,
      c.row.id,
      c.from,
    ]);
  }
  await client.query('COMMIT');
} catch (err) {
  await client.query('ROLLBACK');
  throw err;
} finally {
  client.release();
}
console.log(`[recompose-names] Rewrote ${changes.length} name(s). Done.`);
await pool.end();

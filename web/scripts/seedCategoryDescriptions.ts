/**
 * Write the one-line public description for each top-level category into
 * `categories.seo.description`.
 *
 * ## Why this is data and not a constant in the code
 *
 * The nav-redesign report recorded the owner's standing preference — «catalog
 * copy belongs in the admin panel, not in code» — and this repo already
 * follows it everywhere else that matters: factory display order is a table
 * (`factory_order`) rather than an array, a category's icon and photo are
 * columns, and an article's `seo.description` is edited in the drawer. A
 * category description is the same kind of thing: prose about a product line,
 * which the person who sells that product line should be able to fix without
 * a deploy.
 *
 * So this script is a SEED, not a source of truth. It fills a column that is
 * empty on all nine rows, and from the moment it runs the panel owns the text
 * («ویرایش دسته → توضیح کوتاه دسته», added in the same change — the field was
 * exposed first precisely so this data is not reachable only by a raw write).
 * It will not overwrite anything an admin has since typed: a row that already
 * has a description is reported and skipped unless `--force` is passed.
 *
 * ## What the descriptions say, and what they deliberately do not
 *
 * Each answers one question — what is this product line, and who buys it —
 * because that is what an answer engine lifts to reply to «آهن‌تایم چه
 * می‌فروشد؟», and it is what a visitor scanning the mega-menu needs. Each is
 * written against THIS catalog's actual contents (the sub-category list was
 * read out of the database, not assumed) and against facts this site can
 * stand behind:
 *
 *   · «نبشی و ناودانی» did NOT claim ناودانی when this was first written: the
 *     category is named for it, but its only active sub-categories were
 *     نبشی، سپری and وال پست. That was a stranded-taxonomy artefact, not an
 *     empty shelf — ten priced ناودانی SKUs were sitting on two deactivated
 *     rows — and `restoreChannelSubCategories.ts` put them back on
 *     2026-08-22, so the sentence now names ناودانی سبک/سنگین as well.
 *     The copy itself lives in `categoryDescriptions.ts`.
 *   · «استیل» names گریدهای ۲۰۱/۳۰۴/۳۱۶ because those grades are really on
 *     the rows (`skus.grade` holds 201, 304, 304L and 316L in that category).
 *   · No superlatives, no «بهترین قیمت», no keyword runs. The house voice is
 *     the one already in `catalogNavigationJsonLd` and the category pages —
 *     flat, specific, and about the goods.
 *
 * `wire` (کلاف و مفتول) is written even though the category is currently
 * `is_active = false` and therefore renders nowhere: it is one of the nine the
 * brief named, the copy is correct either way, and having it in place means
 * reactivating the category does not silently ship a description-less panel.
 *
 * ## Safety
 *
 *   · dry run by default — pass --apply to write
 *   · one UPDATE per row, by primary key; `seo` is merged, not replaced, so a
 *     title/canonical/ogImage already on the blob survives
 *   · skips a row that already has a description unless --force
 *   · idempotent: a second run reports zero changes
 *
 *     ./node_modules/.bin/tsx scripts/seedCategoryDescriptions.ts
 *     # …review, then re-run with --apply
 */
import pg from 'pg';

import {
  CATEGORY_DESCRIPTION_MAX_LEN as MAX_LEN,
  CATEGORY_DESCRIPTIONS as DESCRIPTIONS,
} from './categoryDescriptions';

const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[cat-desc] DATABASE_URL is not set.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url, max: 1 });

type Row = { id: string; slug: string; name: string; seo: Record<string, unknown> | null; active: boolean };

const slugs = Object.keys(DESCRIPTIONS);
const { rows } = await pool.query<Row>(
  `SELECT id, slug, name, seo, is_active AS active
     FROM categories WHERE slug = ANY($1::text[]) ORDER BY "order"`,
  [slugs],
);

const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length));

if (rows.length !== slugs.length) {
  const found = new Set(rows.map((r) => r.slug));
  console.error(`[cat-desc] ABORT — missing categor(y/ies): ${slugs.filter((x) => !found.has(x)).join(', ')}`);
  process.exit(1);
}

const tooLong = rows.filter((r) => DESCRIPTIONS[r.slug]!.length > MAX_LEN);
if (tooLong.length > 0) {
  // The panel would refuse these, so the seed must too — otherwise the column
  // holds text an admin can read but not re-save.
  for (const r of tooLong) {
    console.error(`[cat-desc] ABORT — ${r.slug}: ${DESCRIPTIONS[r.slug]!.length} chars (max ${MAX_LEN}).`);
  }
  process.exit(1);
}

type Plan = { row: Row; next: string };
const plans: Plan[] = [];
const skipped: Row[] = [];

console.log(`[cat-desc] ${rows.length} categor(ies) targeted.\n`);
for (const row of rows) {
  const existing = typeof row.seo?.description === 'string' ? row.seo.description : '';
  const next = DESCRIPTIONS[row.slug]!;
  if (existing && existing !== next && !FORCE) {
    skipped.push(row);
    continue;
  }
  if (existing === next) continue;
  plans.push({ row, next });
  console.log(
    `  ${pad(row.slug, 16)} ${pad(row.name, 16)}${row.active ? '' : ' (inactive)'}  ${String(next.length).padStart(3)} chars`,
  );
  console.log(`      ${next}\n`);
}

if (skipped.length > 0) {
  console.log(`--- ${skipped.length} left alone (already carry an admin-authored description; pass --force to replace) ---`);
  for (const r of skipped) console.log(`  ${pad(r.slug, 16)} ${String(r.seo?.description ?? '')}`);
  console.log('');
}

if (!APPLY) {
  console.log(`[cat-desc] DRY RUN — ${plans.length} row(s) would change. Nothing written. Re-run with --apply.`);
  await pool.end();
  process.exit(0);
}

let written = 0;
for (const p of plans) {
  // jsonb || jsonb merges at the top level, so title/canonical/ogImage/
  // focusKeyword on the same blob are preserved. COALESCE covers the NULL
  // column every one of these rows currently has.
  const res = await pool.query(
    `UPDATE categories
        SET seo = COALESCE(seo, '{}'::jsonb) || jsonb_build_object('description', $2::text),
            updated_at = now()
      WHERE id = $1`,
    [p.row.id, p.next],
  );
  written += res.rowCount ?? 0;
}
console.log(`\n[cat-desc] APPLIED — ${written} row(s) updated.`);
await pool.end();

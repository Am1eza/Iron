/**
 * Write `sub_categories.group_label` for the categories deep enough that a flat
 * list stops being scannable.
 *
 * ## Why this is data and not a constant in the code
 *
 * Same reason as `seedCategoryDescriptions.ts`, and the same standing owner
 * preference behind it: catalog copy belongs in the admin panel, not in code.
 * `group_label` is already a column, already validated by the subcategory API
 * (`max(80)`, normalized, `''` → null) and already editable in the panel's
 * taxonomy drawer with a suggestion list built from the labels in use. So this
 * is a SEED for a column that is empty on 111 of 115 rows — not a source of
 * truth. From the moment it runs the panel owns the labels, and a row that
 * already carries one is reported and skipped unless `--force` is passed.
 *
 * ## Why only four categories
 *
 * `groupSubCategories` already renders clusters on both the desktop mega-menu
 * and the mobile drawer; only two rows in the whole catalog (پروفیل's
 * «چهارپهلو» pair) and one pair in لوله («مانیسمان») ever had a label, so the
 * feature was shipped and then left with nothing to show. The categories that
 * need it are the ones whose active sub-category count is at or past the point
 * where an unstructured list stops being read and starts being skimmed:
 *
 *     ورق 19 · فلزات رنگی 13 · استیل 11 · لوله 10 · کلاف و مفتول 8
 *     پروفیل 7 · میلگرد 5 · تیرآهن 4 · نبشی و ناودانی 3
 *
 * میلگرد, تیرآهن, نبشی و ناودانی and پروفیل are left alone deliberately: a
 * heading over a two-item cluster costs a line to save nothing, and پروفیل
 * already carries the one grouping it needs. کلاف و مفتول is seeded even
 * though the CATEGORY is currently `is_active = false` and renders nowhere —
 * the labels are correct either way, and reactivating it later should not
 * silently ship the ungrouped list.
 *
 * ## How the labels were chosen
 *
 * Each groups by the distinction a buyer of that product line actually makes,
 * not by an alphabetical or arbitrary split:
 *
 *   · ورق splits on FINISH and USE, because that is what changes the price and
 *     the supplier: bare hot/cold rolled, coated, alloy/corrosion-resistant,
 *     roof-and-shed forms, and the things fabricated FROM sheet (تسمه،
 *     گریتینگ، پانچ) which are sheet-derived goods rather than sheet. The
 *     third group is «آلیاژی و خاص», not «آلیاژی و مقاوم»: «ورق استیل» is
 *     304L stainless (not an alloy steel) and «ورق دریایی»'s SKUs are graded
 *     A36, so «مقاوم» would be asserting a property the catalog data does not
 *     carry.
 *   · فلزات رنگی splits on METAL — آلومینیوم and مس are two different markets
 *     with two different price bases, and the sub-category names already say
 *     which is which, so the heading is doing pure reduction of a 13-row list
 *     to two 8- and 5-row ones.
 *   · استیل splits on FORM, because the grade (۲۰۱/۳۰۴/۳۱۶) is chosen on the
 *     SKU row and the form is what is chosen in the menu.
 *   · لوله splits on what the pipe CARRIES — seamless, structural/industrial
 *     sections, and fluid lines. «گازی» is a fluid line (it is the plumbing
 *     and gas pipe in this market) and «گوشت‌دار» is a heavy-wall mechanical
 *     section, so they sit on the sides that reading suggests, not the sides
 *     their names first suggest. The existing «مانیسمان» cluster is left
 *     exactly as it is.
 *
 * No label is ever the exact name of one of its own members, which is what
 * `groupSubCategories` turns into a promoted lead link; these are all family
 * names nothing is called, so each renders as a text overline heading over its
 * children. (The existing «چهارپهلو» and «مانیسمان» rows keep their behaviour.)
 *
 * ## Safety
 *
 *   · dry run by default — pass --apply to write
 *   · one UPDATE per row, by primary key, touching one column
 *   · aborts if any `category/sub` slug in the table below is missing, so a
 *     renamed slug fails loudly instead of half-applying
 *   · skips a row that already carries a different label unless --force
 *   · idempotent: a second run reports zero changes
 *
 *     ./node_modules/.bin/tsx scripts/seedSubCategoryGroups.ts
 *     # …review, then re-run with --apply
 */
import pg from 'pg';

const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[sub-groups] DATABASE_URL is not set.');
  process.exit(1);
}

/** The cap `subCategorySchema.groupLabel` enforces in the admin API. */
const MAX_LEN = 80;

/** `<categorySlug>/<subSlug>` → the display cluster it belongs to. */
const GROUPS: Readonly<Record<string, string>> = {
  // ── ورق (19) ────────────────────────────────────────────────────────────
  'sheet/black': 'ورق سیاه و روغنی',
  'sheet/oiled': 'ورق سیاه و روغنی',
  'sheet/pickled': 'ورق سیاه و روغنی',
  'sheet/checkered': 'ورق سیاه و روغنی',
  'sheet/galvanized': 'ورق‌های روکش‌دار',
  'sheet/colored': 'ورق‌های روکش‌دار',
  'sheet/aluzinc': 'ورق‌های روکش‌دار',
  'sheet/tin-coated': 'ورق‌های روکش‌دار',
  'sheet/alloy': 'ورق‌های آلیاژی و خاص',
  'sheet/steel': 'ورق‌های آلیاژی و خاص',
  'sheet/wear-resistant': 'ورق‌های آلیاژی و خاص',
  'sheet/marine': 'ورق‌های آلیاژی و خاص',
  'sheet/deck': 'ورق سقف و سوله',
  'sheet/sandwich-panel': 'ورق سقف و سوله',
  'sheet/corrugated': 'ورق سقف و سوله',
  'sheet/roofing': 'ورق سقف و سوله',
  'sheet/strip': 'فرآورده‌های ورق',
  'sheet/grating': 'فرآورده‌های ورق',
  'sheet/perforated-black': 'فرآورده‌های ورق',

  // ── فلزات رنگی (13) ─────────────────────────────────────────────────────
  'felezat-rangi/aluminum-pipe': 'آلومینیوم',
  'felezat-rangi/aluminum-rebar': 'آلومینیوم',
  'felezat-rangi/aluminum-flat-bar': 'آلومینیوم',
  'felezat-rangi/aluminum-angle': 'آلومینیوم',
  'felezat-rangi/aluminum-welding-wire': 'آلومینیوم',
  'felezat-rangi/aluminum-sheet': 'آلومینیوم',
  'felezat-rangi/aluminum-profile': 'آلومینیوم',
  'felezat-rangi/aluminum-channel': 'آلومینیوم',
  'felezat-rangi/copper-pipe': 'مس',
  'felezat-rangi/copper-strip': 'مس',
  'felezat-rangi/copper-sheet': 'مس',
  'felezat-rangi/copper-rebar': 'مس',
  'felezat-rangi/copper-bushing': 'مس',

  // ── استیل (11) ──────────────────────────────────────────────────────────
  'steel/pipe': 'لوله و پروفیل استیل',
  'steel/profile': 'لوله و پروفیل استیل',
  'steel/tube': 'لوله و پروفیل استیل',
  'steel/angle': 'مقاطع استیل',
  'steel/channel': 'مقاطع استیل',
  'steel/strip': 'مقاطع استیل',
  'steel/wire-mesh': 'توری و مش استیل',
  'steel/mesh': 'توری و مش استیل',
  'steel/ring': 'اتصالات و قطعات استیل',
  'steel/flange': 'اتصالات و قطعات استیل',
  'steel/spring': 'اتصالات و قطعات استیل',

  // ── لوله (10; «مانیسمان» already set, left untouched) ────────────────────
  'pipe/gas': 'لوله انتقال سیال',
  'pipe/industrial': 'لوله ساختمانی و صنعتی',
  'pipe/scaffold': 'لوله ساختمانی و صنعتی',
  'pipe/furniture': 'لوله ساختمانی و صنعتی',
  'pipe/galvanized': 'لوله انتقال سیال',
  'pipe/spiral': 'لوله انتقال سیال',
  'pipe/well-casing': 'لوله انتقال سیال',
  'pipe/thick-walled': 'لوله ساختمانی و صنعتی',

  // ── کلاف و مفتول (8; category inactive today) ───────────────────────────
  'wire/coil': 'کلاف',
  'wire/coil-ribbed': 'کلاف',
  'wire/wire': 'مفتول و سیم',
  'wire/wire-galvanized': 'مفتول و سیم',
  'wire/tie': 'مفتول و سیم',
  'wire/mesh': 'توری و سیم‌جوش',
  'wire/welding-wire': 'توری و سیم‌جوش',
  'wire/wire-rod': 'مفتول و سیم',
};

const pool = new pg.Pool({ connectionString: url, max: 1 });

type Row = {
  id: string;
  catSlug: string;
  slug: string;
  name: string;
  groupLabel: string | null;
  active: boolean;
};

const keys = Object.keys(GROUPS);
const catSlugs = [...new Set(keys.map((k) => k.split('/')[0]!))];

const { rows } = await pool.query<Row>(
  `SELECT s.id, c.slug AS "catSlug", s.slug, s.name,
          s.group_label AS "groupLabel"
     FROM sub_categories s
     JOIN categories c ON c.id = s.category_id
    WHERE c.slug = ANY($1::text[])
    ORDER BY c."order", s."order", s.name`,
  [catSlugs],
);

const byKey = new Map(rows.map((r) => [`${r.catSlug}/${r.slug}`, r]));
const missing = keys.filter((k) => !byKey.has(k));
if (missing.length > 0) {
  console.error(`[sub-groups] ABORT — ${missing.length} sub-categor(y/ies) not found:`);
  for (const k of missing) console.error(`  ${k}`);
  process.exit(1);
}

const tooLong = keys.filter((k) => GROUPS[k]!.length > MAX_LEN);
if (tooLong.length > 0) {
  // The panel would refuse these, so the seed must too.
  for (const k of tooLong)
    console.error(
      `[sub-groups] ABORT — ${k}: label is ${GROUPS[k]!.length} chars (max ${MAX_LEN}).`,
    );
  process.exit(1);
}

/**
 * A label that exactly matches one of its own members' names would be promoted
 * to a LEAD LINK by `groupSubCategories` rather than rendered as a heading.
 * That is a legitimate shape (پروفیل's «چهارپهلو» uses it) but not what any
 * label in this table intends, so a typo that accidentally produced one should
 * stop the seed rather than quietly change how a group renders.
 */
const accidentalLeads = keys.filter((k) => byKey.get(k)!.name.trim() === GROUPS[k]!.trim());
if (accidentalLeads.length > 0) {
  for (const k of accidentalLeads)
    console.error(`[sub-groups] ABORT — ${k}: label equals the row's own name.`);
  process.exit(1);
}

const pad = (s: string, n: number) =>
  s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length);

type Plan = { row: Row; next: string };
const plans: Plan[] = [];
const skipped: Row[] = [];

console.log(
  `[sub-groups] ${keys.length} sub-categor(ies) targeted across ${catSlugs.length} categor(ies).\n`,
);

let lastCat = '';
for (const row of rows) {
  const key = `${row.catSlug}/${row.slug}`;
  const next = GROUPS[key];
  if (!next) continue;
  if (row.groupLabel && row.groupLabel !== next && !FORCE) {
    skipped.push(row);
    continue;
  }
  if (row.groupLabel === next) continue;
  plans.push({ row, next });
  if (row.catSlug !== lastCat) {
    console.log(`  ── ${row.catSlug} ──`);
    lastCat = row.catSlug;
  }
  console.log(
    `     ${pad(row.slug, 22)} ${pad(row.name, 26)}${row.active ? '' : ' (inactive)'}  →  ${next}`,
  );
}

if (skipped.length > 0) {
  console.log(
    `\n--- ${skipped.length} left alone (already carry a different label; pass --force to replace) ---`,
  );
  for (const r of skipped) console.log(`  ${pad(`${r.catSlug}/${r.slug}`, 30)} ${r.groupLabel}`);
}

// What the menu will actually render, per category — the number that matters
// is not "how many labels were written" but "how many lines does the flow draw
// now", because that is what the column heuristic and the drawer's length key
// off. Ungrouped active rows are counted as the singletons they render as.
console.log('\n--- resulting active clusters ---');
for (const cat of catSlugs) {
  const activeRows = rows.filter((r) => r.catSlug === cat && r.active);
  const labelOf = (r: Row) => GROUPS[`${r.catSlug}/${r.slug}`] ?? r.groupLabel;
  const clusters = new Map<string, number>();
  let solo = 0;
  for (const r of activeRows) {
    const l = labelOf(r);
    if (l) clusters.set(l, (clusters.get(l) ?? 0) + 1);
    else solo += 1;
  }
  const lines = activeRows.length + clusters.size;
  console.log(
    `  ${pad(cat, 16)} ${String(activeRows.length).padStart(2)} active → ${clusters.size} group(s) + ${solo} ungrouped = ${lines} rendered line(s)`,
  );
  for (const [label, n] of clusters) console.log(`      ${pad(label, 26)} ${n}`);
}

if (!APPLY) {
  console.log(
    `\n[sub-groups] DRY RUN — ${plans.length} row(s) would change. Nothing written. Re-run with --apply.`,
  );
  await pool.end();
  process.exit(0);
}

let written = 0;
for (const p of plans) {
  const res = await pool.query(`UPDATE sub_categories SET group_label = $2 WHERE id = $1`, [
    p.row.id,
    p.next,
  ]);
  written += res.rowCount ?? 0;
}
console.log(`\n[sub-groups] APPLIED — ${written} row(s) updated.`);
await pool.end();

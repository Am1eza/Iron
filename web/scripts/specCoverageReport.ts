/**
 * Spec-completeness audit — what a buyer actually reads as «نامشخص».
 *
 * Read-only. Selects nothing but the attribute columns, writes nothing, and
 * takes no flags.
 *
 *   ./node_modules/.bin/tsx scripts/specCoverageReport.ts
 *
 * Why this exists rather than a null-count query
 * ----------------------------------------------
 * A raw `count(*) FILTER (WHERE grade IS NULL)` over `skus` reports that ~90%
 * of sub-categories have nulls in `standard`/`condition`/`dimensions`, which
 * is alarming and almost entirely meaningless: those columns are *supposed* to
 * be null wherever the field is not a property of that sub-category's product
 * at all. `attrKeysFor`/`ATTR_DEFS`/`attributeColumns` in
 * `src/lib/utils/catalogLabels.ts` encode exactly which fact each sub
 * publishes, per source, with the research behind every entry — a تیرآهن row
 * with an empty `grade` is not a gap, it is a sub whose grade column was
 * deliberately removed.
 *
 * So this asks the display layer instead of the schema: for every active SKU,
 * it builds the same `AttrRow` the price table builds and calls the real
 * `attributeColumns()` cell function. A cell that comes back `UNKNOWN_VALUE`
 * («نامشخص») is a real gap — the column IS a property of this product and
 * nobody has entered it. A cell that comes back `NOT_APPLICABLE` («—») is not
 * counted, because the column is not that row's fact.
 *
 * The sub-category SLUG is what gets passed as `AttrRow.subCategoryId`, not
 * the UUID: `PriceRow.subCategoryId` carries the slug (see `catalogRepo`'s
 * `toPriceRow`, which maps the FK), and `attributeColumns`' own `appliesTo`
 * re-resolves the key set from it. Passing the UUID silently makes every
 * sub-scoped column read `NOT_APPLICABLE` and undercounts the gap.
 *
 * Baseline, 1405/06/10 (2026-08-31), before the fixes that shipped with this
 * script: 32 sub-category×field combinations, 201 unknown cells over 617
 * active SKUs. An earlier throwaway version of this audit reported 19/83 —
 * it passed the UUID and so silently skipped every sub-scoped column
 * (فلزات‌رنگی, استیل, نبشی و ناودانی, پروفیل, تیرآهن). Those 13 extra
 * combinations are not a new discovery: they are the columns
 * `COLOURED_METAL_ATTRS` and `STEEL_ATTRS` already document as wired to what
 * the source publishes and honestly empty until an admin fills them.
 */
import pg from 'pg';

import { attributeColumns, UNKNOWN_VALUE, type AttrRow } from '../src/lib/utils/catalogLabels';

type SubRow = {
  id: string;
  slug: string;
  name: string;
  category_slug: string;
  category_name: string;
};

type SkuRow = {
  id: string;
  grade: string | null;
  condition: string | null;
  standard: string | null;
  schedule: string | null;
  branch_length_m: string | number | null;
};

type Gap = {
  category: string;
  sub: string;
  slug: string;
  activeSkus: number;
  field: string;
  unknownCount: number;
};

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('[spec-coverage] DATABASE_URL is not set.');
    process.exit(1);
  }

  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const { rows: subs } = await client.query<SubRow>(`
      SELECT sc.id, sc.slug, sc.name, c.slug AS category_slug, c.name AS category_name
      FROM sub_categories sc
      JOIN categories c ON c.id = sc.category_id
      WHERE sc.is_active = true
    `);

    const gaps: Gap[] = [];
    let totalSkus = 0;

    for (const sub of subs) {
      const { rows: skus } = await client.query<SkuRow>(
        `SELECT id, grade, condition, standard, schedule, branch_length_m
           FROM skus
          WHERE sub_category_id = $1 AND is_active = true`,
        [sub.id],
      );
      if (skus.length === 0) continue;
      totalSkus += skus.length;

      // The same shape the price table hands each cell. `subCategoryId` is the
      // SLUG here — see the file header.
      const attrRows: AttrRow[] = skus.map((r) => ({
        subCategoryId: sub.slug,
        grade: r.grade ?? undefined,
        condition: r.condition ?? undefined,
        standard: r.standard ?? undefined,
        schedule: r.schedule ?? undefined,
        branchLengthM: r.branch_length_m == null ? undefined : Number(r.branch_length_m),
      }));

      for (const col of attributeColumns(sub.category_slug, sub.slug)) {
        const unknownCount = attrRows.filter((r) => col.cell(r) === UNKNOWN_VALUE).length;
        if (unknownCount > 0) {
          gaps.push({
            category: sub.category_name,
            sub: sub.name,
            slug: sub.slug,
            activeSkus: skus.length,
            field: col.label,
            unknownCount,
          });
        }
      }
    }

    gaps.sort((a, b) => b.unknownCount - a.unknownCount || a.slug.localeCompare(b.slug));

    console.log('category | sub | slug | activeSkus | field | unknownCount | pctUnknown');
    for (const g of gaps) {
      const pct = ((g.unknownCount / g.activeSkus) * 100).toFixed(0);
      console.log(
        `${g.category} | ${g.sub} | ${g.slug} | ${g.activeSkus} | ${g.field} | ${g.unknownCount} | ${pct}%`,
      );
    }
    const unknownCells = gaps.reduce((n, g) => n + g.unknownCount, 0);
    console.log(
      `\nTOTAL: ${gaps.length} sub×field combinations, ${unknownCells} unknown cells over ${totalSkus} active SKUs.`,
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

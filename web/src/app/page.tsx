import { getCategories } from '@/lib/data/catalog';
import { getRows } from '@/lib/server/catalog';
import { CATEGORY_SUBS } from '@/lib/data/nav';
import type { PriceRow } from '@/lib/types/domain';
import { HeroSearch } from '@/components/home/HeroSearch';
import { PriceBoard } from '@/components/home/PriceBoard';
import { CategoryStage } from '@/components/home/CategoryStage';
import { CompareTeaser, type CompareSlide } from '@/components/home/CompareTeaser';
import { computeBulkSplit } from '@/lib/utils/bulkSplit';
import { ValueProps } from '@/components/home/ValueProps';
import { Partners } from '@/components/home/Partners';
import { JsonLd } from '@/components/seo/JsonLd';
import { orgJsonLd, localBusinessJsonLd } from '@/lib/seo';

/**
 * Home — the «Steel Terminal». Asymmetric hero (AI search + live price board) →
 * cascade product menu (category → sub-group → factory on hover) → why us →
 * dark factory block (mills & customers). Price data is the visual anchor.
 */
export default async function HomePage() {
  const categories = await getCategories();

  // One data pass: all rows per category (live: DB; mock: generator).
  const rowsBySlug = new Map<string, PriceRow[]>();
  await Promise.all(
    categories.map(async (cat) => {
      rowsBySlug.set(cat.slug, await getRows(cat.slug));
    }),
  );

  // Precompute the 3rd menu level (mills per category+sub) server-side, so the
  // mock catalog never ships to the client menu bundle.
  const millsOf = (rows: PriceRow[]) =>
    [...new Set(rows.map((r) => r.factory).filter((f): f is string => Boolean(f)))];
  const factories: Record<string, Record<string, string[]>> = {};
  for (const cat of categories) {
    const rows = rowsBySlug.get(cat.slug) ?? [];
    factories[cat.slug] = {};
    for (const s of CATEGORY_SUBS[cat.slug] ?? []) {
      const subMills = millsOf(rows.filter((r) => r.subCategoryId === s.slug));
      factories[cat.slug]![s.slug] = subMills.length >= 2 ? subMills : millsOf(rows);
    }
  }

  // One representative SKU per headline category for the hero price board.
  const boardRows = ['rebar', 'ibeam', 'sheet', 'profile']
    .map((slug) => {
      const rows = rowsBySlug.get(slug) ?? [];
      return rows[2] ?? rows[0];
    })
    .filter((r): r is PriceRow => Boolean(r));

  // Per-category mill comparison (top 4 mills each) for the compare explorer —
  // slide-by-slide across ALL products, computed server-side.
  const compareSlides: CompareSlide[] = categories
    .map((cat) => ({
      slug: cat.slug,
      name: cat.name,
      lines: computeBulkSplit(rowsBySlug.get(cat.slug) ?? [], 1).lines.slice(0, 4).map((l) => ({
        factory: l.factory,
        pricePerKg: l.pricePerKg,
        best: l.best,
      })),
    }))
    .filter((s) => s.lines.length >= 2);

  return (
    <>
      <JsonLd data={[orgJsonLd(), localBusinessJsonLd()]} />
      <HeroSearch board={<PriceBoard rows={boardRows} />} />
      <CategoryStage categories={categories} factories={factories} />
      <CompareTeaser slides={compareSlides} />
      <ValueProps />
      <Partners />
    </>
  );
}

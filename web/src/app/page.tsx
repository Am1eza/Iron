import { getCategories } from '@/lib/data/catalog';
import { getFactories, getRows } from '@/lib/mock/catalogData';
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

  // Precompute the 3rd menu level (mills per category+sub) server-side, so the
  // mock catalog never ships to the client menu bundle.
  const factories: Record<string, Record<string, string[]>> = {};
  for (const cat of categories) {
    factories[cat.slug] = {};
    for (const s of CATEGORY_SUBS[cat.slug] ?? []) {
      factories[cat.slug]![s.slug] = getFactories(cat.slug, s.slug);
    }
  }

  // One representative SKU per headline category for the hero price board.
  const boardRows = ['rebar', 'ibeam', 'sheet', 'profile']
    .map((slug) => {
      const rows = getRows(slug);
      return rows[2] ?? rows[0];
    })
    .filter((r): r is PriceRow => Boolean(r));

  // Per-category mill comparison (top 4 mills each) for the compare explorer —
  // slide-by-slide across ALL products, computed server-side.
  const compareSlides: CompareSlide[] = categories
    .map((cat) => ({
      slug: cat.slug,
      name: cat.name,
      lines: computeBulkSplit(getRows(cat.slug), 1).lines.slice(0, 4).map((l) => ({
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

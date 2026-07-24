import type { Metadata } from 'next';
import { getCategories, getSubsMap } from '@/lib/data/catalog';
import { getRows } from '@/lib/server/catalog';

import { routes } from '@/lib/routes';
import type { PriceRow } from '@/lib/types/domain';
import { HeroSearch } from '@/components/home/HeroSearch';
import { PriceBoard } from '@/components/home/PriceBoard';
import { CategoryStage } from '@/components/home/CategoryStage';
import { CompareTeaser, type CompareSlide } from '@/components/home/CompareTeaser';
import { computeBulkSplit } from '@/lib/utils/bulkSplit';
import { ValueProps } from '@/components/home/ValueProps';
import { Partners } from '@/components/home/Partners';
import { JsonLd } from '@/components/seo/JsonLd';
import { buildMetadata, orgJsonLd, localBusinessJsonLd, websiteJsonLd } from '@/lib/seo';
import { getContact } from '@/lib/server/contact';
import { getSetting } from '@/lib/server/repos/settingsRepo';
import { hasDb } from '@/lib/server/db/client';
import { HeroVideo } from '@/components/home/HeroVideo';

export const metadata: Metadata = buildMetadata({
  title: 'آهن‌تایم — بازار هوشمند آهن و فولاد',
  description:
    'آهن‌تایم، بازار هوشمند آهن و فولاد: مشاور هوش مصنوعی، قیمت‌های شفاف و لحظه‌ای و زمان تحویل مشخص. اول مشورت، بعد خرید.',
  path: routes.home(),
  absoluteTitle: true,
});

// A price-marketplace homepage must never be frozen at build time — without
// this the hero board's «لحظه‌ای» prices and freshness stamp were whatever
// the last DEPLOY happened to capture. 5 minutes matches /prices.
export const revalidate = 300;

/**
 * Home — the «Steel Terminal». Asymmetric hero (AI search + live price board,
 * or the motion-graphic video once the owner supplies it — see SITE_HERO_VIDEO)
 * → hover-reveal product menu → compare explorer → why us → dark factory block
 * (mills & customers). Price data is the visual anchor.
 */
export default async function HomePage() {
  const contact = await getContact();
  const categories = await getCategories();
  const subsMap = await getSubsMap();
  // Owner-supplied hero motion graphic (admin setting; empty = price board).
  // The video drops into the exact slot the board occupies — no layout change.
  // hasDb guard: build-time prerender (ISR) runs without DATABASE_URL — an
  // unguarded getSetting broke `next build` on this exact line.
  const heroVideo = hasDb()
    ? await getSetting<{ url: string }>('SITE_HERO_VIDEO', { url: '' })
    : { url: '' };

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
    for (const s of subsMap[cat.slug] ?? []) {
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
      <JsonLd data={[orgJsonLd(contact), localBusinessJsonLd(contact), websiteJsonLd()]} />
      <HeroSearch
        board={heroVideo.url ? <HeroVideo src={heroVideo.url} /> : <PriceBoard rows={boardRows} />}
      />
      <CategoryStage categories={categories} subs={subsMap} factories={factories} />
      <CompareTeaser slides={compareSlides} />
      <ValueProps />
      <Partners />
    </>
  );
}

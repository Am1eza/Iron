import { getLocale } from 'next-intl/server';
import { getLocalizedName } from '@/lib/utils/localizedNames';
import type { AppLocale } from '@/i18n/config';
import { getRows } from '@/lib/server/catalog';
import { getCategories, getSubsMap } from '@/lib/data/catalog';
import type { PriceRow } from '@/lib/types/domain';
import { CategoryStage } from '@/components/home/CategoryStage';
import { CompareTeaser, type CompareSlide } from '@/components/home/CompareTeaser';
import { computeBulkSplit, pickBestGroup } from '@/lib/utils/bulkSplit';
import { WhyAhantime } from '@/components/home/WhyAhantime';
import { TOOLS_NAV, SERVICES_NAV_FULL } from '@/lib/data/nav';
import { clientLogos } from '../../../public/assets/logos/clients';

/**
 * Everything below the hero that needs a full catalog read: the mega-menu's
 * per-category mill lists, the compare explorer, and «چرا آهن‌تایم»'s trust
 * numbers. Split out of `HomePage` into its own async component, rendered
 * behind a `<Suspense>` boundary (page.tsx), so this fetch — the slow part
 * of the homepage (see the perf investigation this was added for) — never
 * blocks the hero (board/video, the page's LCP element) from streaming
 * first. Business logic here is unchanged from the pre-split `HomePage`;
 * only WHEN it runs relative to the rest of the page moved.
 *
 * Fetches `categories`/`subsMap` itself (request-deduped via `cache()`, same
 * read `HomeJsonLd`/`HeroTrustLine` make) rather than taking them as props —
 * a prop would have to be awaited in `HomePage` before returning any JSX at
 * all, which blocked the ENTIRE response (hero included) behind this read
 * despite this component's own `<Suspense>` boundary; see page.tsx's git
 * history for the perf investigation this was split out of.
 */
export async function HomeBelowFold() {
  const [categories, subsMap, localeRaw] = await Promise.all([getCategories(), getSubsMap(), getLocale()]);
  const locale = localeRaw as AppLocale;
  // One data pass: all rows per category (live: DB; mock: generator).
  const rowsBySlug = new Map<string, PriceRow[]>();
  await Promise.all(
    categories.map(async (cat) => {
      rowsBySlug.set(cat.slug, await getRows(cat.slug));
    }),
  );

  // Precompute the 3rd menu level (mills per category+sub) server-side, so the
  // mock catalog never ships to the client menu bundle.
  const factories: Record<string, Record<string, string[]>> = {};
  for (const cat of categories) {
    const allMills = new Set<string>();
    const millsBySub = new Map<string | undefined, Set<string>>();
    for (const row of rowsBySlug.get(cat.slug) ?? []) {
      if (!row.factory) continue;
      allMills.add(row.factory);
      const mills = millsBySub.get(row.subCategoryId) ?? new Set<string>();
      mills.add(row.factory);
      millsBySub.set(row.subCategoryId, mills);
    }
    const categoryMills = [...allMills];
    factories[cat.slug] = {};
    for (const sub of subsMap[cat.slug] ?? []) {
      const subMills = millsBySub.get(sub.slug);
      factories[cat.slug]![sub.slug] =
        subMills && subMills.size >= 2 ? [...subMills] : categoryMills;
    }
  }

  // Per-category mill comparison (top 4 mills each) for the compare explorer —
  // slide-by-slide across ALL products, computed server-side. Narrowed to the
  // single most-quoted sub-category first — blending a mill's price across
  // entirely different sub-categories in the category would average
  // non-equivalent products into a misleading "who's cheapest".
  const compareSlides: CompareSlide[] = categories
    .map((cat) => {
      const rows = rowsBySlug.get(cat.slug) ?? [];
      const group = pickBestGroup(rows);
      const scoped = group ? rows.filter((r) => r.subCategoryId === group.subCategoryId) : rows;
      return {
        slug: cat.slug,
        name: getLocalizedName(cat, locale),
        lines: computeBulkSplit(scoped, 1)
          .lines.slice(0, 4)
          .map((l) => ({
            factory: l.factory,
            pricePerKg: l.pricePerKg,
            best: l.best,
          })),
      };
    })
    .filter((s) => s.lines.length >= 2);

  // REAL trust numbers (never invented): priced SKUs and distinct supplying
  // mills, straight from the rows already fetched above — see HomePage's
  // former «REAL trust numbers» comment (now here) for the exact rules.
  const allRows = [...new Map([...rowsBySlug.values()].flat().map((r) => [r.id, r])).values()];
  const pricedRows = allRows.filter((r) => !r.current.priceHidden && !r.current.priceIsEstimated);
  const skuCount = pricedRows.length;
  const factoryCount = new Set(pricedRows.map((r) => r.factory).filter(Boolean)).size;

  return (
    <>
      <CategoryStage categories={categories} subs={subsMap} factories={factories} />
      <CompareTeaser slides={compareSlides} />
      {/* «چرا آهن‌تایم» — WHAT this marketplace does that a plain price list
          does not. Every number it shows is derived here, server-side, from
          live data or from the nav arrays that render the tools/services
          menus — never a marketing figure typed into the component. */}
      <WhyAhantime
        stats={{
          skuCount,
          factoryCount,
          clientCount: clientLogos.length,
          toolCount: TOOLS_NAV.length,
          serviceCount: SERVICES_NAV_FULL.length,
        }}
      />
    </>
  );
}

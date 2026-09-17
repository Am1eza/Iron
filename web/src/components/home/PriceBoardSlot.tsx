import { getRows } from '@/lib/server/catalog';
import type { PriceRow } from '@/lib/types/domain';
import { PriceBoard } from '@/components/home/PriceBoard';

const BOARD_CATEGORY_SLUGS = ['rebar', 'ibeam', 'sheet', 'profile'] as const;

/**
 * The hero's price-board fallback for when no `SITE_HERO_VIDEO` is set — its
 * own async component (rows: one representative SKU per headline category),
 * behind the same `<Suspense>` boundary as `HeroVideo`'s sibling branch in
 * page.tsx. `HeroVideo` itself needs no DB read at all; this is the one that
 * does, so only this branch pays for it.
 */
export async function PriceBoardSlot() {
  const rowsBySlug = new Map<string, PriceRow[]>();
  await Promise.all(
    BOARD_CATEGORY_SLUGS.map(async (slug) => {
      rowsBySlug.set(slug, await getRows(slug));
    }),
  );
  const boardRows = BOARD_CATEGORY_SLUGS.map((slug) => {
    const rows = rowsBySlug.get(slug) ?? [];
    return rows[2] ?? rows[0];
  }).filter((r): r is PriceRow => Boolean(r));

  return <PriceBoard rows={boardRows} />;
}

import { getLocale, getTranslations } from 'next-intl/server';
import { getRows } from '@/lib/server/catalog';
import type { Category } from '@/lib/types/domain';
import type { PriceRow } from '@/lib/types/domain';
import { toPersianDigits } from '@/lib/utils/format';
import styles from './HeroSearch.module.css';

/**
 * The hero's trust line — real priced-SKU / mill counts, server-computed.
 * Split out of `HeroSearch`/`HomePage` (async, its own component) so it can
 * sit behind its own `<Suspense>` boundary: this is the ONE catalog fetch on
 * the page still on the critical path to the hero, and the hero (board/
 * video, the page's LCP element) must never wait on it. See page.tsx.
 *
 * Re-fetches `getRows` per category rather than sharing `HomePage`'s own
 * pass — the DB round trip is cheap (~a few ms per category; see the perf
 * investigation this was added for) and isolating it here is what lets it
 * resolve independently of the below-fold sections' own fetch.
 */
export async function HeroTrustLine({ categories }: { categories: Category[] }) {
  const t = await getTranslations('home.hero');
  const locale = await getLocale();
  const num = (n: number) => (locale === 'fa' ? toPersianDigits(n) : String(n));

  const allRowsBySku = new Map<string, PriceRow>();
  await Promise.all(
    categories.map(async (cat) => {
      for (const row of await getRows(cat.slug)) allRowsBySku.set(row.id, row);
    }),
  );
  // Same de-dup + visibility rule as HomePage's own trust numbers — see
  // page.tsx's «REAL trust numbers» comment for why.
  const pricedRows = [...allRowsBySku.values()].filter(
    (r) => !r.current.priceHidden && !r.current.priceIsEstimated,
  );
  const skuCount = pricedRows.length;
  const factoryCount = new Set(pricedRows.map((r) => r.factory).filter(Boolean)).size;

  if (skuCount === 0) return null;

  return (
    <p className={`${styles.trust} tnum`}>
      {t('trust', { sku: num(skuCount), factory: num(factoryCount) })}
    </p>
  );
}

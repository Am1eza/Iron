import { getCategories } from '@/lib/data/catalog';
import { AIHero } from '@/components/home/AIHero';
import { FeaturedPrices } from '@/components/home/FeaturedPrices';
import { CategoryGrid } from '@/components/home/CategoryGrid';
import { ValueProps } from '@/components/home/ValueProps';
import { CategoryRail } from '@/components/layout/CategoryRail';
import { JsonLd } from '@/components/seo/JsonLd';
import { orgJsonLd, localBusinessJsonLd } from '@/lib/seo';

/**
 * Home — the dual-mode landing (UX Engineering, Phase 2).
 * AI door (hero) + structured door (rail / featured prices / category grid) +
 * trust pillars. The rail is the signature nav (desktop fixed / mobile chip bar).
 */
export default async function HomePage() {
  const categories = await getCategories();

  return (
    <>
      <JsonLd data={[orgJsonLd(), localBusinessJsonLd()]} />

      <CategoryRail categories={categories} />

      <AIHero />

      <div className="container">
        <FeaturedPrices />
        <CategoryGrid categories={categories} />
        <ValueProps />
      </div>
    </>
  );
}

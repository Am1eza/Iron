import { getCategories } from '@/lib/data/catalog';
import { AIHero } from '@/components/home/AIHero';
import { FeaturedPrices } from '@/components/home/FeaturedPrices';
import { CategoryGrid } from '@/components/home/CategoryGrid';
import { ValueProps } from '@/components/home/ValueProps';
import { Reveal } from '@/components/ui';
import { JsonLd } from '@/components/seo/JsonLd';
import { orgJsonLd, localBusinessJsonLd } from '@/lib/seo';

/**
 * Home — the minimal, dual-mode landing. AI door (hero) + structured door
 * (featured prices · category grid) + trust pillars, each revealing on scroll.
 */
export default async function HomePage() {
  const categories = await getCategories();

  return (
    <>
      <JsonLd data={[orgJsonLd(), localBusinessJsonLd()]} />

      <AIHero />

      <div className="container">
        <Reveal>
          <CategoryGrid categories={categories} />
        </Reveal>
        <Reveal>
          <FeaturedPrices />
        </Reveal>
      </div>

      <Reveal>
        <ValueProps />
      </Reveal>
    </>
  );
}

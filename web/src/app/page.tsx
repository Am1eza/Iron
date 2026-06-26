import { getCategories } from '@/lib/data/catalog';
import { ForgedHero } from '@/components/home/ForgedHero';
import { FeaturedPrices } from '@/components/home/FeaturedPrices';
import { CategoryGrid } from '@/components/home/CategoryGrid';
import { ValueProps } from '@/components/home/ValueProps';
import { Reveal } from '@/components/ui';
import { JsonLd } from '@/components/seo/JsonLd';
import { orgJsonLd, localBusinessJsonLd } from '@/lib/seo';

/**
 * Home — «Forged Minimalism». A cinematic, AI-first dark hero (the only focal
 * point: ask پولادین), then a calm light data flow revealed on scroll.
 */
export default async function HomePage() {
  const categories = await getCategories();

  return (
    <>
      <JsonLd data={[orgJsonLd(), localBusinessJsonLd()]} />

      <ForgedHero />

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

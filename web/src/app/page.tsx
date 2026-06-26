import { getCategories } from '@/lib/data/catalog';
import { HeroSearch } from '@/components/home/HeroSearch';
import { MarketSnapshot } from '@/components/home/MarketSnapshot';
import { CategoryStage } from '@/components/home/CategoryStage';
import { ValueProps } from '@/components/home/ValueProps';
import { Partners } from '@/components/home/Partners';
import { JsonLd } from '@/components/seo/JsonLd';
import { orgJsonLd, localBusinessJsonLd } from '@/lib/seo';

/**
 * Home — light, professional, data-forward. Central AI search (asks what you
 * need) → live market pulse (the price-checker hook) → browse by category (the
 * signature rail) → why us → mills & customers. A trustworthy steel marketplace.
 */
export default async function HomePage() {
  const categories = await getCategories();

  return (
    <>
      <JsonLd data={[orgJsonLd(), localBusinessJsonLd()]} />
      <HeroSearch />
      <MarketSnapshot />
      <CategoryStage categories={categories} />
      <ValueProps />
      <Partners />
    </>
  );
}

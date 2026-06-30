import { getCategories } from '@/lib/data/catalog';
import { HeroSearch } from '@/components/home/HeroSearch';
import { ProductStrip } from '@/components/home/ProductStrip';
import { CategoryStage } from '@/components/home/CategoryStage';
import { ValueProps } from '@/components/home/ValueProps';
import { Partners } from '@/components/home/Partners';
import { JsonLd } from '@/components/seo/JsonLd';
import { orgJsonLd, localBusinessJsonLd } from '@/lib/seo';

/**
 * Home — light, professional, product-first. Central AI search (asks what you
 * need) → the product strip (all categories, immediately under the AI) → browse
 * by category → why us → mills & customers. Reads as an iron marketplace on
 * entry; no FX/gold prices here (those live on inner pages + /market).
 */
export default async function HomePage() {
  const categories = await getCategories();

  return (
    <>
      <JsonLd data={[orgJsonLd(), localBusinessJsonLd()]} />
      <HeroSearch />
      <ProductStrip categories={categories} />
      <CategoryStage categories={categories} />
      <ValueProps />
      <Partners />
    </>
  );
}

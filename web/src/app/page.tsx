import { getCategories } from '@/lib/data/catalog';
import { HeroSearch } from '@/components/home/HeroSearch';
import { CategoryStage } from '@/components/home/CategoryStage';
import { ValueProps } from '@/components/home/ValueProps';
import { Partners } from '@/components/home/Partners';
import { JsonLd } from '@/components/seo/JsonLd';
import { orgJsonLd, localBusinessJsonLd } from '@/lib/seo';

/**
 * Home — light, professional, product-first. Central AI search (asks what you
 * need) → the category menu directly under the AI (hover a category → its
 * sub-groups) → why us → mills & customers. Reads as an iron marketplace on
 * entry; no FX/gold prices here (those live on inner pages + /market).
 */
export default async function HomePage() {
  const categories = await getCategories();

  return (
    <>
      <JsonLd data={[orgJsonLd(), localBusinessJsonLd()]} />
      <HeroSearch />
      <CategoryStage categories={categories} />
      <ValueProps />
      <Partners />
    </>
  );
}

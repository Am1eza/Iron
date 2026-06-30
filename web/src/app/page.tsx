import { getCategories } from '@/lib/data/catalog';
import { getFactories } from '@/lib/mock/catalogData';
import { CATEGORY_SUBS } from '@/lib/data/nav';
import { HeroSearch } from '@/components/home/HeroSearch';
import { CategoryStage } from '@/components/home/CategoryStage';
import { ValueProps } from '@/components/home/ValueProps';
import { Partners } from '@/components/home/Partners';
import { JsonLd } from '@/components/seo/JsonLd';
import { orgJsonLd, localBusinessJsonLd } from '@/lib/seo';

/**
 * Home — light, professional, product-first. Central AI search (asks what you
 * need) → the cascade product menu directly under the AI (category → sub-group →
 * factory, each level opening on hover) → why us → mills & customers. Reads as an
 * iron marketplace on entry; no FX/gold prices here (those live on /market).
 */
export default async function HomePage() {
  const categories = await getCategories();

  // Precompute the 3rd menu level (mills per category+sub) server-side, so the
  // mock catalog never ships to the client menu bundle.
  const factories: Record<string, Record<string, string[]>> = {};
  for (const cat of categories) {
    factories[cat.slug] = {};
    for (const s of CATEGORY_SUBS[cat.slug] ?? []) {
      factories[cat.slug]![s.slug] = getFactories(cat.slug, s.slug);
    }
  }

  return (
    <>
      <JsonLd data={[orgJsonLd(), localBusinessJsonLd()]} />
      <HeroSearch />
      <CategoryStage categories={categories} factories={factories} />
      <ValueProps />
      <Partners />
    </>
  );
}

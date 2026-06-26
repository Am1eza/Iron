import { getCategories } from '@/lib/data/catalog';
import { CategoryStage } from '@/components/home/CategoryStage';
import { ValueProps } from '@/components/home/ValueProps';
import { Reveal } from '@/components/ui';
import { JsonLd } from '@/components/seo/JsonLd';
import { orgJsonLd, localBusinessJsonLd } from '@/lib/seo';

/**
 * Home — minimal. One dark stage with two simple doors (ask فولادنو / pick a
 * category from the rail), then a calm trust band. Nothing else competes.
 */
export default async function HomePage() {
  const categories = await getCategories();

  return (
    <>
      <JsonLd data={[orgJsonLd(), localBusinessJsonLd()]} />
      <CategoryStage categories={categories} />
      <Reveal>
        <ValueProps />
      </Reveal>
    </>
  );
}

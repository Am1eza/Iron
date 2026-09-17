import { getCategories, getSubsMap } from '@/lib/data/catalog';
import { getContact } from '@/lib/server/contact';
import { JsonLd } from '@/components/seo/JsonLd';
import { orgJsonLd, localBusinessJsonLd, websiteJsonLd, catalogNavigationJsonLd } from '@/lib/seo';

/**
 * The homepage's structured data, as its own async component behind its own
 * `<Suspense>` (page.tsx) — org/local-business/website/catalog-nav JSON-LD is
 * invisible to a visitor and must never be what a crawler's fetch waits on
 * before the hero (the page's LCP element) streams. Was previously awaited
 * directly in `HomePage`, alongside `categories`/`subsMap`/`contact`, which
 * blocked the whole response — including the hero — behind three DB reads;
 * see page.tsx's git history for the perf investigation this was split out
 * of. `getCategories`/`getSubsMap` are the same request-deduped reads
 * `HeroTrustLine`/`HomeBelowFold` make, so this adds no extra DB round trip.
 */
export async function HomeJsonLd() {
  const [contact, categories, subsMap] = await Promise.all([
    getContact(),
    getCategories(),
    getSubsMap(),
  ]);
  const catalogNav = catalogNavigationJsonLd(categories, subsMap);

  return (
    <JsonLd
      data={[
        orgJsonLd(contact),
        localBusinessJsonLd(contact),
        websiteJsonLd(),
        ...(catalogNav ? [catalogNav] : []),
      ]}
    />
  );
}

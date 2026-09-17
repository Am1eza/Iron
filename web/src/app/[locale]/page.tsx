import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getCategories, getSubsMap } from '@/lib/data/catalog';

import { routes } from '@/lib/routes';
import { HeroSearch } from '@/components/home/HeroSearch';
import { HeroTrustLine } from '@/components/home/HeroTrustLine';
import { PriceBoardSlot } from '@/components/home/PriceBoardSlot';
import { HomeBelowFold } from '@/components/home/HomeBelowFold';
import { ValueProps } from '@/components/home/ValueProps';
import { Partners } from '@/components/home/Partners';
import { JsonLd } from '@/components/seo/JsonLd';
import {
  buildMetadata,
  orgJsonLd,
  localBusinessJsonLd,
  websiteJsonLd,
  catalogNavigationJsonLd,
} from '@/lib/seo';
import { getContact } from '@/lib/server/contact';
import { getSetting } from '@/lib/server/repos/settingsRepo';
import { hasDb } from '@/lib/server/db/client';
import { HeroVideo } from '@/components/home/HeroVideo';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('meta.home');
  return buildMetadata({
    title: t('title'),
    description: t('description'),
    path: routes.home(),
    absoluteTitle: true,
  });
}

// A price-marketplace homepage must never be frozen at build time — without
// this the hero board's latest published prices and freshness stamp were whatever
// the last DEPLOY happened to capture. 5 minutes matches /prices.
export const revalidate = 300;
// Production images are built without the database. The homepage's catalog
// and trust counts must therefore be rendered at request time from live data,
// never baked as fixtures (or as an empty first-deploy page).
export const dynamic = 'force-dynamic';

/**
 * Home — the «Steel Terminal». Asymmetric hero (AI search + live price board,
 * or the motion-graphic video once the owner supplies it — see SITE_HERO_VIDEO)
 * → hover-reveal product menu → compare explorer → why us → dark factory block
 * (mills & customers). Price data is the visual anchor.
 */
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [contact, categories, subsMap] = await Promise.all([
    getContact(),
    getCategories(),
    getSubsMap(),
  ]);
  // Owner-supplied hero motion graphic (admin setting; empty = price board).
  // The video drops into the exact slot the board occupies — no layout change.
  // hasDb guard: build-time prerender (ISR) runs without DATABASE_URL — an
  // unguarded getSetting broke `next build` on this exact line.
  //
  // This one `getSetting` call is the ONLY per-request data `HomePage` itself
  // still awaits — everything that needs a full catalog read (the hero trust
  // line, the price-board fallback, the mega-menu/compare/why-us section
  // below the fold) was split into its own async component behind its own
  // `<Suspense>` (HeroTrustLine / PriceBoardSlot / HomeBelowFold) so none of
  // it blocks the hero — the page's LCP element — from streaming first. Perf
  // investigation: the catalog reads themselves were never the slow part in
  // isolation, but awaiting all of them here, un-suspended, held up the
  // entire response (real-user LCP ~5.5s despite a fast TTFB) — see PR that
  // introduced this split for the measurements.
  const heroVideo = hasDb()
    ? await getSetting<{ url: string }>('SITE_HERO_VIDEO', { url: '' })
    : { url: '' };

  // Null only when the catalog read failed and the chrome degraded to an empty
  // rail — there is nothing to describe, so nothing is asserted.
  const catalogNav = catalogNavigationJsonLd(categories, subsMap);

  return (
    <>
      {/* The catalog taxonomy as structured data. The homepage and the
          /prices hub are the two URLs an answer engine actually lands on to
          work out what this business sells, so that is where it is published
          — not site-wide, where it would be the same list repeated on every
          article and tool page. */}
      <JsonLd
        data={[
          orgJsonLd(contact),
          localBusinessJsonLd(contact),
          websiteJsonLd(),
          ...(catalogNav ? [catalogNav] : []),
        ]}
      />
      <HeroSearch
        board={heroVideo.url ? <HeroVideo src={heroVideo.url} /> : (
          <Suspense fallback={null}>
            <PriceBoardSlot />
          </Suspense>
        )}
        trust={
          <Suspense fallback={null}>
            <HeroTrustLine categories={categories} />
          </Suspense>
        }
      />
      <Suspense fallback={null}>
        <HomeBelowFold categories={categories} subsMap={subsMap} />
      </Suspense>
      <ValueProps />
      <Partners />
    </>
  );
}

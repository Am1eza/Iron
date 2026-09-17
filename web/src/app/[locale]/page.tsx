import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { routes } from '@/lib/routes';
import { HeroSearch } from '@/components/home/HeroSearch';
import { HeroTrustLine } from '@/components/home/HeroTrustLine';
import { PriceBoardSlot } from '@/components/home/PriceBoardSlot';
import { HomeBelowFold } from '@/components/home/HomeBelowFold';
import { HomeJsonLd } from '@/components/home/HomeJsonLd';
import { ValueProps } from '@/components/home/ValueProps';
import { Partners } from '@/components/home/Partners';
import { buildMetadata } from '@/lib/seo';
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
  const t = await getTranslations({ locale, namespace: 'meta.home' });
  return buildMetadata({
    locale,
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
  // Owner-supplied hero motion graphic (admin setting; empty = price board).
  // The video drops into the exact slot the board occupies — no layout change.
  // hasDb guard: build-time prerender (ISR) runs without DATABASE_URL — an
  // unguarded getSetting broke `next build` on this exact line.
  //
  // This one `getSetting` call (settingsRepo caches it in-process for 60s) is
  // the ONLY per-request data `HomePage` itself still awaits before returning
  // JSX — everything that needs a full catalog read (the JSON-LD, the hero
  // trust line, the price-board fallback, the mega-menu/compare/why-us
  // section below the fold) was split into its own async component behind
  // its own `<Suspense>` (HomeJsonLd / HeroTrustLine / PriceBoardSlot /
  // HomeBelowFold), each fetching its own data rather than receiving it as a
  // prop, so none of it blocks the hero — the page's LCP element — from
  // streaming first.
  //
  // Perf investigation (see PR #407): the catalog reads themselves were never
  // the slow part in isolation, but the FIRST cut of this split still awaited
  // `categories`/`subsMap`/`contact` here, at the top of `HomePage`, to pass
  // down as props — which meant `HomePage` itself could not return any JSX,
  // Suspense boundaries included, until those reads finished. Confirmed live:
  // real-user LCP ~5.5s despite a fast TTFB, and reproduced locally by
  // injecting a 2s delay into `getCategories` — TTFB rose by the full 2s
  // instead of only delaying the trust-line/below-fold Suspense boundaries.
  // Moving those reads into the components that actually need them (still
  // one shared, request-deduped DB read each, via `cache()`) is what makes
  // the `<Suspense>` boundaries below actually take effect.
  const heroVideo = hasDb()
    ? await getSetting<{ url: string }>('SITE_HERO_VIDEO', { url: '' })
    : { url: '' };

  return (
    <>
      {/* The catalog taxonomy as structured data. The homepage and the
          /prices hub are the two URLs an answer engine actually lands on to
          work out what this business sells, so that is where it is published
          — not site-wide, where it would be the same list repeated on every
          article and tool page. */}
      <Suspense fallback={null}>
        <HomeJsonLd />
      </Suspense>
      <HeroSearch
        board={heroVideo.url ? <HeroVideo src={heroVideo.url} /> : (
          <Suspense fallback={null}>
            <PriceBoardSlot />
          </Suspense>
        )}
        trust={
          <Suspense fallback={null}>
            <HeroTrustLine />
          </Suspense>
        }
      />
      <Suspense fallback={null}>
        <HomeBelowFold />
      </Suspense>
      <ValueProps />
      <Partners />
    </>
  );
}

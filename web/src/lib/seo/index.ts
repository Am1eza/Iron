/**
 * SEO helpers — metadata patterns (IA §7) + schema.org JSON-LD.
 */
import type { Metadata } from 'next';
import { VERIFIED_CHANNELS } from '@/lib/data/nav';
import { SITE_ORIGIN } from '@/lib/utils/url';
import type { PriceBasis } from '@/lib/types/domain';
import { LOCALES, DEFAULT_LOCALE, isAppLocale, type AppLocale } from '@/i18n/config';
import { withLocalePrefix } from '@/lib/server/utils/localePath';

/**
 * UN/CEFACT Recommendation 20 unit codes for the price bases that HAVE one.
 *
 * `undefined` is a deliberate value, not a gap: a «شاخه» (one whole bar of a
 * given length), a «کلاف» and a «برگ» have no clean Rec-20 unit, and stating
 * a nearby-but-wrong code is exactly the failure this map exists to end —
 * the field is omitted instead, which schema.org permits. Only codes that
 * unambiguously mean the same thing as the basis are listed:
 *   KGM = kilogram · H87 = piece · MTK = square metre.
 */
/**
 * `priceValidUntil` derived from when the price was actually SET, not from
 * when the page happened to render.
 *
 * It used to be `Date.now() + 7 days`, unconditionally. That asserted a
 * week of validity for a price that this site's own freshness policy
 * withholds after PRICE_STALE_HIDE_AFTER_DAYS (currently 2) business days —
 * so a میلگرد priced two days ago was simultaneously badged «کهنه» on the
 * page and published to Google as valid for another week. Regenerating the
 * page pushed the claim forward again, meaning the window could never
 * actually expire.
 *
 * Calendar days are used against a business-day SLA on purpose: business
 * days always span at least as much real time, so this errs SHORT and can
 * never out-claim the policy.
 *
 * Returns `undefined` — no claim at all — when the window has already
 * closed, which is the honest representation of a price that is stale now.
 */
function offerValidUntil(
  updatedAt?: string,
  validityDays?: number,
  now = Date.now(),
): string | undefined {
  if (!updatedAt || !validityDays || validityDays <= 0) return undefined;
  const set = Date.parse(updatedAt);
  if (!Number.isFinite(set)) return undefined;
  const until = set + validityDays * 864e5;
  if (until <= now) return undefined;
  return new Date(until).toISOString().slice(0, 10);
}

const UN_CEFACT_UNIT: Record<PriceBasis, string | undefined> = {
  kg: 'KGM',
  piece: 'H87',
  sqm: 'MTK',
  branch: undefined,
  coil: undefined,
  sheet: undefined,
};

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ahantime.com';
/** Resolve against SITE_URL without throwing on a malformed admin value. */
function safeResolve(path: string): URL | undefined {
  try {
    return new URL(path, SITE_URL);
  } catch {
    return undefined;
  }
}
const BRAND = 'آهن‌تایم';
/** Default social-preview image — static app/opengraph-image.png (1200×630). */
const DEFAULT_OG_IMAGE = new URL('/opengraph-image.png', SITE_URL).toString();
const LOGO_URL = new URL('/brand/icon-512.png', SITE_URL).toString();

export const ORG_NAME = BRAND;
export const CONTACT = {
  address:
    'تهران، اقدسیه، خیابان موحد دانش، نبش بن‌بست نسیم، ساختمان نسیم، پلاک ۱، طبقه چهارم، واحد ۷',
  phoneLandline: '02126297512',
  phoneMobile: '09121395954',
};

/** Brand as it is written in each locale's own copy (messages/*.json). */
export const BRAND_BY_LOCALE: Record<AppLocale, string> = {
  fa: 'آهن‌تایم',
  en: 'Ahantime',
  ar: 'آهن‌تايم',
  zh: 'Ahantime',
};

/** Open Graph `og:locale` per app locale (language_TERRITORY, as OG requires). */
export const OG_LOCALE: Record<AppLocale, string> = {
  fa: 'fa_IR',
  en: 'en_US',
  ar: 'ar_AR',
  zh: 'zh_CN',
};

function toAppLocale(locale: string | undefined): AppLocale {
  return locale && isAppLocale(locale) ? locale : DEFAULT_LOCALE;
}

/** Paths on this origin that are files or non-page endpoints — never localized. */
const NON_PAGE_PREFIXES = ['/api/', '/uploads/', '/brand/', '/products/', '/media/', '/assets/', '/_next/'];

/**
 * Deep-copies a JSON-LD graph, moving every URL that names one of THIS site's
 * pages into `locale` (`https://ahantime.com/prices/rebar` →
 * `https://ahantime.com/en/prices/rebar`). Builders here take locale-neutral
 * `routes.*` paths, so without this an /en page's BreadcrumbList, ItemList
 * and Product `url`s all pointed at the Persian pages — contradicting the
 * page's own canonical. Images, uploads, API routes and other origins are
 * left untouched; the default locale is a no-op.
 */
export function localizeJsonLdUrls<T>(data: T, locale: string): T {
  const target = toAppLocale(locale);
  if (target === DEFAULT_LOCALE) return data;
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return localizePageUrl(v, target);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, walk(x)]));
    }
    return v;
  };
  return walk(data) as T;
}

function localizePageUrl(value: string, locale: AppLocale): string {
  if (value !== SITE_ORIGIN && !value.startsWith(`${SITE_ORIGIN}/`)) return value;
  const url = safeResolve(value);
  if (!url) return value;
  const path = url.pathname;
  if (NON_PAGE_PREFIXES.some((p) => path.startsWith(p)) || /\.[a-z0-9]{2,5}$/i.test(path)) return value;
  // Already localized (a caller that built a prefixed URL itself).
  if (LOCALES.some((l) => l !== DEFAULT_LOCALE && (path === `/${l}` || path.startsWith(`/${l}/`)))) return value;
  // `{search_term_string}` placeholders must survive URL re-serialisation verbatim.
  const suffix = value.slice(SITE_ORIGIN.length + path.length);
  return `${SITE_ORIGIN}${withLocalePrefix(path, locale)}${suffix}`;
}

export function buildMetadata(opts: {
  /**
   * The locale of the page being described. Drives the canonical (each
   * language version canonicalises to ITSELF — hreflang alternates are only
   * honoured between pages that are each their own canonical), `og:locale`
   * and the brand suffix. It used to be implicit, and every /en, /ar, /zh
   * page published `canonical → the Persian URL` plus a Persian og:locale:
   * Search Console listed them as «Alternate page with proper canonical tag»
   * and not one was indexed. Omitted ⇒ the default (fa) locale.
   */
  locale?: string;
  /**
   * `false` for a page whose BODY exists only in Persian even when its chrome
   * is translated — article detail pages (articles.translations covers title
   * and excerpt, not body, I-10). Its /en, /ar, /zh versions then point their
   * canonical at the Persian original and declare no hreflang set: a mostly
   * Persian page presented to Google as «the English version» is the
   * thin/mismatched-language signal that costs the whole locale. Default true.
   */
  translatedContent?: boolean;
  title: string;
  description?: string;
  path?: string;
  noindex?: boolean;
  ogImage?: string;
  /** Homepage only: `title` is already the full brand title — skip the root
   *  layout's `%s | آهن‌تایم` template instead of double-appending the brand. */
  absoluteTitle?: boolean;
  /** `article` on blog/news detail pages — see `articleOpenGraph` below. */
  openGraphType?: 'website' | 'article';
  /** ISO strings; emitted as `article:published_time` / `article:modified_time`. */
  publishedTime?: string;
  modifiedTime?: string;
}): Metadata {
  // The origin assertion is the backstop that makes an off-site canonical
  // impossible REGARDLESS of which caller got validation wrong. `opts.path`
  // is admin-controlled on article pages (`seo.canonical`), and a value like
  // `//evil.com` or `/\evil.com` resolves to `https://evil.com/` here — which
  // is then published as this article's canonical AND its `og:url`. Dropping
  // the canonical entirely is the right failure: a missing canonical costs a
  // little SEO, a wrong one hands the ranking to someone else.
  const locale = toAppLocale(opts.locale);
  const brand = BRAND_BY_LOCALE[locale];
  const resolved = opts.path ? safeResolve(opts.path) : undefined;
  // `opts.path` is always the locale-NEUTRAL path (routes.* never carry a
  // prefix); the canonical is that path in THIS page's locale.
  const translated = opts.translatedContent !== false;
  const canonical =
    resolved && resolved.origin === SITE_ORIGIN
      ? new URL(
          withLocalePrefix(resolved.pathname, translated ? locale : DEFAULT_LOCALE) +
            resolved.search,
          SITE_URL,
        ).toString()
      : undefined;
  const ogImage = opts.ogImage ? new URL(opts.ogImage, SITE_URL).toString() : DEFAULT_OG_IMAGE;
  const socialTitle = opts.absoluteTitle ? opts.title : `${opts.title} | ${brand}`;
  return {
    title: opts.absoluteTitle ? { absolute: opts.title } : opts.title,
    description: opts.description,
    // I-08: real per-locale URLs now exist (i18n/routing.ts's URL-based
    // locale migration — localePrefix:'as-needed', so fa stays bare and
    // en/ar/zh get their own /en, /ar, /zh prefix on this SAME path). Every
    // locale is declared, plus `x-default` pointing at the fa (bare) URL —
    // the actual default a locale-less visitor/crawler receives. Before that
    // migration this was deliberately self-referential-only (fa canonical,
    // no other locale declared): en/ar/zh were a client-side chrome swap
    // over the identical URL, so declaring them here would have claimed
    // alternates that did not exist as real URLs — an hreflang error Google
    // would have reported and no return-tag could ever have confirmed.
    alternates:
      canonical && resolved && !translated
        ? { canonical }
        : canonical && resolved
          ? {
              canonical,
              languages: {
                ...Object.fromEntries(
                  LOCALES.map((locale) => [
                    locale,
                    new URL(
                      withLocalePrefix(resolved.pathname, locale) + resolved.search,
                      SITE_URL,
                    ).toString(),
                  ]),
                ),
                'x-default': new URL(
                  withLocalePrefix(resolved.pathname, DEFAULT_LOCALE) + resolved.search,
                  SITE_URL,
                ).toString(),
              },
            }
          : undefined,
    robots: opts.noindex ? { index: false, follow: false } : undefined,
    openGraph: {
      title: socialTitle,
      description: opts.description,
      url: canonical,
      images: [ogImage],
      siteName: brand,
      locale: OG_LOCALE[locale],
      alternateLocale: LOCALES.filter((l) => l !== locale).map((l) => OG_LOCALE[l]),
      // Telegram/WhatsApp/LinkedIn card parsers read OG, not JSON-LD — an
      // article shared into a steel-trading group rendered as a generic
      // website card with no date. The JSON-LD was already correct.
      ...(opts.openGraphType === 'article'
        ? {
            type: 'article' as const,
            publishedTime: opts.publishedTime,
            modifiedTime: opts.modifiedTime,
          }
        : { type: 'website' as const }),
    },
    twitter: {
      card: 'summary_large_image',
      title: socialTitle,
      description: opts.description,
      images: [ogImage],
    },
  };
}

/* ---------- JSON-LD builders (inject via <script type="application/ld+json">) ---------- */

type ContactLike = { address: string; phoneLandline: string; phoneMobile: string };

export function orgJsonLd(contact: ContactLike = CONTACT) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: BRAND,
    url: SITE_URL,
    logo: LOGO_URL,
    slogan: 'اول مشورت، بعد خرید',
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: contact.phoneLandline,
      contactType: 'customer service',
      areaServed: 'IR',
      availableLanguage: 'fa',
    },
    // Only owner-verified profiles — `sameAs` is an identity claim, and the
    // spec's placeholder handles were being asserted to Google as this
    // business's real accounts. Omitted entirely while none are verified;
    // a missing sameAs costs nothing, a wrong one can attach the knowledge
    // panel to someone else's profile. See nav.ts's VERIFIED_CHANNELS.
    ...(VERIFIED_CHANNELS.length > 0 ? { sameAs: VERIFIED_CHANNELS.map((c) => c.href) } : {}),
  };
}

export function localBusinessJsonLd(contact: ContactLike = CONTACT) {
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: BRAND,
    url: SITE_URL,
    image: DEFAULT_OG_IMAGE,
    telephone: [contact.phoneLandline, contact.phoneMobile],
    address: { '@type': 'PostalAddress', addressLocality: 'تهران', streetAddress: contact.address },
    priceRange: '$$',
  };
}

/** WebSite + SearchAction — lets Google offer a sitelinks search box for brand queries. */
export function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: BRAND,
    url: SITE_URL,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${SITE_URL}/search?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}

/**
 * BreadcrumbList JSON-LD.
 *
 * **Every** `ListItem` carries `item`, the last one included. Google's
 * reference calls `item` optional on the final crumb, but "optional" only
 * means it will not error: an entry with a bare `name` is the one node in the
 * trail that cannot be resolved to a URL, so the crumb that matters most —
 * the page actually being ranked — contributes no link to the graph. Nothing
 * is lost by stating it, and Bing/Yandex and the schema.org validators do
 * treat a URL-less terminal node as an incomplete list.
 *
 * A crumb with **no** URL is DROPPED rather than emitted name-only, and the
 * remaining entries are renumbered so `position` stays 1..n contiguous (a gap
 * invalidates the list). This is not hypothetical: `/tools/[tool]` renders an
 * «ابزارها» crumb for a section that has no index page — `/tools` is a real
 * 404 — so the honest trail there is خانه › <tool>, not a middle node
 * pointing nowhere.
 */
export function breadcrumbJsonLd(items: { name: string; url?: string }[]) {
  const linked = items.filter((it): it is { name: string; url: string } => Boolean(it.url));
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: linked.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: new URL(it.url, SITE_URL).toString(),
    })),
  };
}

/** Lightweight listing schema for category/sub-category hub pages (one Product per SKU
 *  is reserved for the SKU detail page itself — see productJsonLd). */
export function itemListJsonLd(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      url: new URL(it.url, SITE_URL).toString(),
    })),
  };
}

/**
 * Product schema for a SKU page.
 *
 * This site has **no online payment** (CLAUDE.md §1): the price is published,
 * but the transaction is closed by a human on the phone against a proforma.
 * The offer therefore describes an offline sale:
 *
 *  - `availability` is `InStoreOnly` for a live SKU — "offered only at the
 *    seller's physical location", which is literally true here — never
 *    `InStock`, which asserts an online-purchasable item. Claiming
 *    `InStock` on a page with no buy button is the textbook
 *    "structured data mismatch" that gets merchant rich results stripped
 *    site-wide.
 *  - `availability` is **never published**. There is no stock or inventory
 *    column anywhere in the SKU/price schema (verified against the live DB),
 *    so the site does not know whether anything is in stock. This used to be
 *    fed `sku.isActive`, which only means "published in the catalog" — an
 *    unpublished product simply has no page, so the field asserted
 *    `InStoreOnly` for every product that could be seen at all, carrying no
 *    information and claiming something untracked. Restoring it requires real
 *    stock data, not a proxy for it.
 *  - `businessFunction` is GoodRelations `Sell`, and `priceSpecification`
 *    carries `valueAddedTaxIncluded: false`, because every published price on
 *    this site excludes VAT (see PriceRow.current.price). Without that flag
 *    the bare `price` reads as a VAT-inclusive final price and mismatches the
 *    invoice the buyer is eventually given.
 *  - `unitCode` follows the SKU's `priceBasis` and is **omitted** where no
 *    honest UN/CEFACT code exists. It used to be hard-coded `KGM`, which
 *    told Google that a per-قطعه وال‌پست or a per-۱۵-متری کلاف مسی price was
 *    a per-kilogram rate — off by whole orders of magnitude on the exact
 *    rows `PriceBasis` was introduced to stop mis-captioning.
 */
export function productJsonLd(p: {
  name: string;
  price: number; // Toman, excl. VAT (see PriceRow.current.price)
  /** True when the price is a stale-hidden `0` sentinel (PriceRow.current.
   *  priceHidden — see priceFreshness.ts). W23 audit fix: this used to
   *  reach Google as `price: 0, availability: InStock` — a false claim and
   *  a known Merchant Center policy violation. No `offers` block at all is
   *  the correct representation of "price withheld, ask us" — Product
   *  schema doesn't require one. */
  priceHidden?: boolean;
  /** What the price is denominated in (PriceRow.current.priceBasis). Drives
   *  `unitCode`; defaults to `kg`, which is the column's own default. */
  priceBasis?: PriceBasis;
  /** When this price was last set (`current_prices.updated_at`, ISO). With
   *  `priceValidityDays`, this is what `priceValidUntil` is derived FROM —
   *  see `offerValidUntil`. Omitted ⇒ no validity is asserted. */
  priceUpdatedAt?: string;
  /** The freshness SLA in days (`PRICE_STALE_HIDE_AFTER_DAYS`). */
  priceValidityDays?: number;
  url: string;
  image?: string;
  brand?: string;
  sku?: string;
}) {
  const offerUrl = new URL(p.url, SITE_URL).toString();
  const unitCode = UN_CEFACT_UNIT[p.priceBasis ?? 'kg'];
  const priceValidUntil = offerValidUntil(p.priceUpdatedAt, p.priceValidityDays);
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    ...(p.image ? { image: [new URL(p.image, SITE_URL).toString()] } : {}),
    ...(p.sku ? { sku: p.sku } : {}),
    ...(p.brand ? { brand: { '@type': 'Brand', name: p.brand } } : {}),
    ...(p.priceHidden
      ? {}
      : {
          offers: {
            '@type': 'Offer',
            // Toman has no ISO 4217 code; Rial (IRR) is the smallest official unit — 1 Toman = 10 Rial.
            price: p.price * 10,
            priceCurrency: 'IRR',
            priceSpecification: {
              '@type': 'UnitPriceSpecification',
              price: p.price * 10,
              priceCurrency: 'IRR',
              valueAddedTaxIncluded: false,
              ...(unitCode ? { unitCode } : {}),
            },
            // GoodRelations: this offer is a sale, concluded offline.
            businessFunction: 'http://purl.org/goodrelations/v1#Sell',
            // No `availability`. See the doc comment above: nothing in the
            // schema tracks stock, so there is nothing true to assert.
            ...(priceValidUntil ? { priceValidUntil } : {}),
            url: offerUrl,
            seller: { '@type': 'Organization', name: BRAND },
          },
        }),
  };
}

export function articleJsonLd(a: {
  title: string;
  url: string;
  publishedAt?: string;
  updatedAt?: string;
  image?: string;
  /** 'NewsArticle' for /news (timely reporting), 'Article' for evergreen /blog. */
  type?: 'Article' | 'NewsArticle';
}) {
  return {
    '@context': 'https://schema.org',
    '@type': a.type ?? 'Article',
    headline: a.title,
    datePublished: a.publishedAt,
    dateModified: a.updatedAt ?? a.publishedAt,
    image: [a.image ? new URL(a.image, SITE_URL).toString() : DEFAULT_OG_IMAGE],
    url: new URL(a.url, SITE_URL).toString(),
    mainEntityOfPage: new URL(a.url, SITE_URL).toString(),
    author: { '@type': 'Organization', name: BRAND },
    publisher: {
      '@type': 'Organization',
      name: BRAND,
      logo: { '@type': 'ImageObject', url: LOGO_URL },
    },
  };
}

/** FAQPage schema — the standard structured-data surface answer engines (Google's
 *  "People also ask", AI Overviews, voice assistants) extract self-contained
 *  Q&A pairs from. Each `answer` must stand alone (no "as shown above") since
 *  it is quoted out of page context by the consumer, not rendered in place. */
export function faqJsonLd(items: { question: string; answer: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((it) => ({
      '@type': 'Question',
      name: it.question,
      acceptedAnswer: { '@type': 'Answer', text: it.answer },
    })),
  };
}

/**
 * `ItemList` of `SiteNavigationElement` for the product taxonomy — one entry
 * per top-level category, each carrying its own sub-categories.
 *
 * Why this and not something richer: Google publishes no rich result for
 * `SiteNavigationElement`, so this earns nothing in classic SERP terms and is
 * not here pretending to. What it does is state, in a vocabulary crawlers and
 * answer engines already parse, the one fact a marketplace most needs an
 * assistant to get right — *what this site sells* — as a named, ordered list
 * of product lines with a canonical URL each, rather than leaving it to be
 * inferred from anchor text scattered through a menu.
 *
 * It mirrors the rendered mega-menu exactly: same source arrays, same order,
 * same Persian names, same URLs. That is the condition for it being honest
 * structured data rather than the invisible-keyword kind — nothing is asserted
 * here that a visitor cannot see in the menu.
 */
export function catalogNavigationJsonLd(
  categories: readonly { slug: string; name: string; description?: string }[],
  subsBySlug: Readonly<Record<string, readonly { slug: string; name: string }[]>>,
) {
  if (categories.length === 0) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `دسته‌بندی محصولات ${BRAND}`,
    description:
      'دسته‌بندی‌های آهن‌آلات و فولادی که آهن‌تایم قیمت روز آن‌ها را منتشر می‌کند و سفارش می‌گیرد.',
    numberOfItems: categories.length,
    itemListElement: categories.map((cat, i) => ({
      '@type': 'SiteNavigationElement',
      position: i + 1,
      name: cat.name,
      // The admin-authored line from `categories.seo.description`, when there
      // is one. This is the half of the taxonomy that says what «نبشی و
      // ناودانی» actually IS: without it the structured data carries nine
      // Persian nouns and nothing an answer engine can lift to answer "what
      // does آهن‌تایم sell in this category". Omitted rather than defaulted —
      // an invented sentence in schema.org is worse than none.
      ...(cat.description ? { description: cat.description } : {}),
      url: new URL(`/prices/${cat.slug}`, SITE_URL).toString(),
      hasPart: (subsBySlug[cat.slug] ?? []).map((sub) => ({
        '@type': 'SiteNavigationElement',
        name: sub.name,
        url: new URL(`/prices/${cat.slug}/${sub.slug}`, SITE_URL).toString(),
      })),
    })),
  };
}

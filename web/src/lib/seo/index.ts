/**
 * SEO helpers — metadata patterns (IA §7) + schema.org JSON-LD.
 */
import type { Metadata } from 'next';
import { CHANNELS } from '@/lib/data/nav';
import { SITE_ORIGIN } from '@/lib/utils/url';

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
  address: 'تهران، اقدسیه، خیابان موحد دانش، نبش بن‌بست نسیم، ساختمان نسیم، پلاک ۱، طبقه چهارم، واحد ۷',
  phoneLandline: '02126297512',
  phoneMobile: '09121395954',
};

export function buildMetadata(opts: {
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
  const resolved = opts.path ? safeResolve(opts.path) : undefined;
  const canonical =
    resolved && resolved.origin === SITE_ORIGIN ? resolved.toString() : undefined;
  const ogImage = opts.ogImage ? new URL(opts.ogImage, SITE_URL).toString() : DEFAULT_OG_IMAGE;
  const socialTitle = opts.absoluteTitle ? opts.title : `${opts.title} | ${BRAND}`;
  return {
    title: opts.absoluteTitle ? { absolute: opts.title } : opts.title,
    description: opts.description,
    alternates: canonical ? { canonical } : undefined,
    robots: opts.noindex ? { index: false, follow: false } : undefined,
    openGraph: {
      title: socialTitle,
      description: opts.description,
      url: canonical,
      images: [ogImage],
      siteName: BRAND,
      locale: 'fa_IR',
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
    sameAs: CHANNELS.map((c) => c.href),
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

export function breadcrumbJsonLd(items: { name: string; url?: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    // The current page (last crumb) may omit `item` per schema.org — include its
    // name so the full trail is represented.
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      ...(it.url ? { item: new URL(it.url, SITE_URL).toString() } : {}),
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
 *  - `availability` is **omitted entirely** when the caller does not know the
 *    state. It used to default to `InStock` for anything that was not exactly
 *    `false` — including `undefined` — so a missing value became a positive
 *    stock claim.
 *  - `businessFunction` is GoodRelations `Sell`, and `priceSpecification`
 *    carries `valueAddedTaxIncluded: false`, because every published price on
 *    this site is per-kilogram and excludes VAT (see PriceRow.current.price).
 *    Without that flag the bare `price` reads as a VAT-inclusive final price
 *    and mismatches the invoice the buyer is eventually given.
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
  /** Tri-state on purpose. `true` → InStoreOnly, `false` → OutOfStock,
   *  `undefined` → no availability claim at all. Never defaulted. */
  available?: boolean;
  url: string;
  image?: string;
  brand?: string;
  sku?: string;
}) {
  const offerUrl = new URL(p.url, SITE_URL).toString();
  const availability =
    p.available === true
      ? 'https://schema.org/InStoreOnly'
      : p.available === false
        ? 'https://schema.org/OutOfStock'
        : undefined;
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
              unitCode: 'KGM', // UN/CEFACT: kilogram — prices are per-kg
            },
            // GoodRelations: this offer is a sale, concluded offline.
            businessFunction: 'http://purl.org/goodrelations/v1#Sell',
            ...(availability ? { availability } : {}),
            // Steel prices move daily; give the offer a short validity window so
            // Google doesn't flag a missing/expired priceValidUntil (which can
            // suppress the merchant rich result).
            priceValidUntil: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10),
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
    publisher: { '@type': 'Organization', name: BRAND, logo: { '@type': 'ImageObject', url: LOGO_URL } },
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

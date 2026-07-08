/**
 * SEO helpers — metadata patterns (IA §7) + schema.org JSON-LD.
 */
import type { Metadata } from 'next';
import { CHANNELS } from '@/lib/data/nav';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ahantime.com';
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
}): Metadata {
  const canonical = opts.path ? new URL(opts.path, SITE_URL).toString() : undefined;
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
      type: 'website',
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

export function productJsonLd(p: {
  name: string;
  price: number; // Toman, excl. VAT (see PriceRow.current.price)
  /** Defaults to true (InStock) when omitted — pass row.isActive explicitly where known. */
  available?: boolean;
  url: string;
  image?: string;
  brand?: string;
  sku?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    ...(p.image ? { image: [new URL(p.image, SITE_URL).toString()] } : {}),
    ...(p.sku ? { sku: p.sku } : {}),
    ...(p.brand ? { brand: { '@type': 'Brand', name: p.brand } } : {}),
    offers: {
      '@type': 'Offer',
      // Toman has no ISO 4217 code; Rial (IRR) is the smallest official unit — 1 Toman = 10 Rial.
      price: p.price * 10,
      priceCurrency: 'IRR',
      availability: `https://schema.org/${p.available === false ? 'OutOfStock' : 'InStock'}`,
      // Steel prices move daily; give the offer a short validity window so
      // Google doesn't flag a missing/expired priceValidUntil (which can
      // suppress the merchant rich result).
      priceValidUntil: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10),
      url: new URL(p.url, SITE_URL).toString(),
      seller: { '@type': 'Organization', name: BRAND },
    },
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

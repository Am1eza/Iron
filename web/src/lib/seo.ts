/**
 * SEO helpers — metadata patterns (IA §7) + schema.org JSON-LD.
 */
import type { Metadata } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://fooladno.com';
const BRAND = 'فولادنو';

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
}): Metadata {
  const canonical = opts.path ? new URL(opts.path, SITE_URL).toString() : undefined;
  return {
    title: opts.title,
    description: opts.description,
    alternates: canonical ? { canonical } : undefined,
    robots: opts.noindex ? { index: false, follow: false } : undefined,
    openGraph: {
      title: `${opts.title} | ${BRAND}`,
      description: opts.description,
      url: canonical,
      images: opts.ogImage ? [opts.ogImage] : undefined,
      siteName: BRAND,
      locale: 'fa_IR',
      type: 'website',
    },
  };
}

/* ---------- JSON-LD builders (inject via <script type="application/ld+json">) ---------- */

export function orgJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: BRAND,
    url: SITE_URL,
    slogan: 'اول مشورت، بعد خرید',
  };
}

export function localBusinessJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: BRAND,
    url: SITE_URL,
    telephone: [CONTACT.phoneLandline, CONTACT.phoneMobile],
    address: { '@type': 'PostalAddress', addressLocality: 'تهران', streetAddress: CONTACT.address },
  };
}

export function breadcrumbJsonLd(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: new URL(it.url, SITE_URL).toString(),
    })),
  };
}

export function productJsonLd(p: {
  name: string;
  price: number;
  availability?: boolean;
  url: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    offers: {
      '@type': 'Offer',
      price: p.price,
      priceCurrency: 'IRR', // displayed as Toman; stored unit per backend
      availability: `https://schema.org/${p.availability === false ? 'OutOfStock' : 'InStock'}`,
      url: new URL(p.url, SITE_URL).toString(),
    },
  };
}

export function articleJsonLd(a: { title: string; url: string; publishedAt?: string }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: a.title,
    datePublished: a.publishedAt,
    url: new URL(a.url, SITE_URL).toString(),
    publisher: { '@type': 'Organization', name: BRAND },
  };
}

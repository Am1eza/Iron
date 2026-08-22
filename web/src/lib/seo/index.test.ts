import { describe, it, expect } from 'vitest';
import {
  breadcrumbJsonLd,
  buildMetadata,
  catalogNavigationJsonLd,
  orgJsonLd,
  productJsonLd,
} from './index';
import { CHANNELS } from '@/lib/data/nav';

type Offer = {
  availability?: string;
  price: number;
  priceCurrency: string;
  priceValidUntil: string;
  url: string;
  businessFunction: string;
  priceSpecification: {
    price: number;
    priceCurrency: string;
    valueAddedTaxIncluded: boolean;
    unitCode: string;
  };
};
const offerOf = (o: ReturnType<typeof productJsonLd>): Offer | undefined =>
  (o as { offers?: Offer }).offers;

describe('productJsonLd', () => {
  const base = { name: 'میلگرد ۱۴ آجدار', price: 42_000, url: '/prices/rebar/deformed/x' };

  it('never claims InStock — a live SKU is InStoreOnly (no online payment)', () => {
    const offer = offerOf(productJsonLd({ ...base, available: true }));
    expect(offer?.availability).toBe('https://schema.org/InStoreOnly');
  });

  it('omits availability entirely when the caller does not know it', () => {
    // Regression: this used to default to InStock for anything !== false,
    // i.e. a missing value became a positive stock claim.
    const offer = offerOf(productJsonLd(base));
    expect(offer).toBeDefined();
    expect(offer).not.toHaveProperty('availability');
  });

  it('marks an inactive SKU OutOfStock', () => {
    expect(offerOf(productJsonLd({ ...base, available: false }))?.availability).toBe(
      'https://schema.org/OutOfStock',
    );
  });

  it('declares the price as VAT-exclusive, per kilogram, for an offline sale', () => {
    const offer = offerOf(productJsonLd({ ...base, available: true }));
    expect(offer?.price).toBe(420_000); // Toman → Rial
    expect(offer?.priceSpecification.valueAddedTaxIncluded).toBe(false);
    expect(offer?.priceSpecification.unitCode).toBe('KGM');
    expect(offer?.businessFunction).toBe('http://purl.org/goodrelations/v1#Sell');
  });

  it('emits no offer at all when the price is the stale-hidden sentinel', () => {
    expect(offerOf(productJsonLd({ ...base, price: 0, priceHidden: true, available: true }))).toBeUndefined();
  });

  // The silent-10x class of bug, pinned from both ends. Every published price
  // on this site is in TOMAN; the only ISO 4217 code for Iran is IRR (Rial),
  // and 1 Toman = 10 Rial. Tagging the Toman figure `IRR` unconverted would
  // publish a price one tenth of the real one — a number Google would happily
  // show in a rich result and no test would have caught.
  describe('Toman → IRR conversion', () => {
    it.each([
      [42_000, 420_000],
      [1, 10],
      [667_027, 6_670_270],
    ])('publishes %i Toman as %i IRR', (toman, rial) => {
      const offer = offerOf(productJsonLd({ ...base, price: toman, available: true }))!;
      expect(offer.price).toBe(rial);
      expect(offer.priceSpecification.price).toBe(rial);
    });

    it('never publishes the raw Toman figure under an IRR tag', () => {
      const toman = 42_000;
      const offer = offerOf(productJsonLd({ ...base, price: toman, available: true }))!;
      expect(offer.priceCurrency).toBe('IRR');
      expect(offer.priceSpecification.priceCurrency).toBe('IRR');
      expect(offer.price).not.toBe(toman);
      expect(offer.price / toman).toBe(10);
    });

    it('keeps the Offer price and its UnitPriceSpecification in lockstep', () => {
      // Two places carry the same number; a fix applied to one and not the
      // other is a self-contradicting offer.
      const offer = offerOf(productJsonLd({ ...base, available: true }))!;
      expect(offer.price).toBe(offer.priceSpecification.price);
      expect(offer.priceCurrency).toBe(offer.priceSpecification.priceCurrency);
    });
  });

  it('gives the offer its own absolute canonical URL', () => {
    const offer = offerOf(productJsonLd({ ...base, available: true }))!;
    expect(offer.url).toBe('https://ahantime.com/prices/rebar/deformed/x');
  });

  it('bounds priceValidUntil to a near date — steel prices move daily', () => {
    const offer = offerOf(productJsonLd({ ...base, available: true }))!;
    expect(offer.priceValidUntil).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const days = (Date.parse(offer.priceValidUntil) - Date.now()) / 864e5;
    expect(days).toBeGreaterThan(0);
    expect(days).toBeLessThanOrEqual(7);
  });
});

describe('breadcrumbJsonLd', () => {
  type Entry = { '@type': string; position: number; name: string; item?: string };
  const listOf = (o: ReturnType<typeof breadcrumbJsonLd>) => o.itemListElement as Entry[];

  it('gives EVERY ListItem an item — the last one included', () => {
    // Regression (GSC, 1405/05): the terminal crumb was emitted name-only, so
    // the one node in the trail that identifies the page being ranked had no
    // resolvable URL.
    const list = listOf(
      breadcrumbJsonLd([
        { name: 'خانه', url: '/' },
        { name: 'قیمت‌ها', url: '/prices' },
        { name: 'لوله', url: '/prices/pipe' },
      ]),
    );
    expect(list).toHaveLength(3);
    for (const e of list) expect(e.item).toBeTruthy();
    expect(list[2]!.item).toBe('https://ahantime.com/prices/pipe');
  });

  it('resolves every item to an absolute same-origin URL', () => {
    const list = listOf(
      breadcrumbJsonLd([
        { name: 'خانه', url: '/' },
        { name: 'x', url: '/x' },
      ]),
    );
    for (const e of list) expect(e.item).toMatch(/^https:\/\/ahantime\.com\//);
  });

  it('drops a URL-less crumb and renumbers, keeping position contiguous', () => {
    // `/tools/[tool]` renders an «ابزارها» crumb for a section with no index
    // page (`/tools` is a real 404). A name-only middle node, or a gap in
    // `position`, invalidates the list.
    const list = listOf(
      breadcrumbJsonLd([
        { name: 'خانه', url: '/' },
        { name: 'ابزارها' },
        { name: 'محاسبه وزن', url: '/tools/weight' },
      ]),
    );
    expect(list.map((e) => e.position)).toEqual([1, 2]);
    expect(list.map((e) => e.name)).toEqual(['خانه', 'محاسبه وزن']);
  });
});

describe('buildMetadata — canonical/og:url can never leave this origin', () => {
  const canonicalOf = (m: ReturnType<typeof buildMetadata>) =>
    (m.alternates as { canonical?: string } | undefined)?.canonical;
  const ogUrlOf = (m: ReturnType<typeof buildMetadata>) =>
    (m.openGraph as { url?: string } | undefined)?.url;

  it('emits a same-origin canonical for a normal path', () => {
    const m = buildMetadata({ title: 'x', path: '/blog/steel-weight-guide' });
    expect(canonicalOf(m)).toBe('https://ahantime.com/blog/steel-weight-guide');
    expect(ogUrlOf(m)).toBe('https://ahantime.com/blog/steel-weight-guide');
  });

  // The sink half of the `seo.canonical` finding: even if a caller's
  // validation is wrong (or an old row already holds a bad value), the
  // canonical must be DROPPED rather than published pointing off-site. A
  // missing canonical costs a little SEO; a wrong one hands the ranking away.
  it.each(['//evil.com', '/\\evil.com', '/\\/evil.com', 'https://evil.com/x'])(
    'drops the canonical for %j instead of publishing it',
    (path) => {
      const m = buildMetadata({ title: 'x', path });
      expect(canonicalOf(m)).toBeUndefined();
      expect(ogUrlOf(m)).toBeUndefined();
    },
  );

  it('keeps an absolute URL back to this site', () => {
    const m = buildMetadata({ title: 'x', path: 'https://ahantime.com/blog/a' });
    expect(canonicalOf(m)).toBe('https://ahantime.com/blog/a');
  });

  it('marks article pages as og:type article with its dates', () => {
    const m = buildMetadata({
      title: 'x',
      path: '/blog/a',
      openGraphType: 'article',
      publishedTime: '2026-06-24T07:00:00.000Z',
      modifiedTime: '2026-07-30T23:54:43.000Z',
    });
    const og = m.openGraph as { type?: string; publishedTime?: string; modifiedTime?: string };
    expect(og.type).toBe('article');
    expect(og.publishedTime).toBe('2026-06-24T07:00:00.000Z');
    expect(og.modifiedTime).toBe('2026-07-30T23:54:43.000Z');
  });

  it('stays og:type website everywhere else', () => {
    expect((buildMetadata({ title: 'x', path: '/blog' }).openGraph as { type?: string }).type).toBe(
      'website',
    );
  });
});

describe('buildMetadata — hreflang', () => {
  const langsOf = (m: ReturnType<typeof buildMetadata>) =>
    (m.alternates as { languages?: Record<string, string> } | undefined)?.languages;

  it('declares one self-referential fa alternate matching the canonical', () => {
    const m = buildMetadata({ title: 'x', path: '/prices' });
    expect(langsOf(m)).toEqual({ fa: 'https://ahantime.com/prices' });
  });

  it('never declares en/ar/zh alternates — no such URLs exist (client-side i18n only)', () => {
    const langs = langsOf(buildMetadata({ title: 'x', path: '/prices' })) ?? {};
    expect(Object.keys(langs)).toEqual(['fa']);
    expect(langs).not.toHaveProperty('x-default');
  });

  it('emits no alternates block at all when the canonical was rejected', () => {
    // Same failure mode as the canonical: a rejected path must not produce a
    // dangling hreflang pointing anywhere.
    expect(buildMetadata({ title: 'x', path: '//evil.com' }).alternates).toBeUndefined();
  });
});

describe('orgJsonLd — sameAs is an identity claim, not a link list', () => {
  it('asserts no social profile while none is owner-verified', () => {
    // Regression: the spec's four placeholder handles (t.me/ahantime etc.)
    // were published to Google as this business's real accounts.
    expect(orgJsonLd()).not.toHaveProperty('sameAs');
  });

  it('publishes only channels explicitly marked verified', () => {
    const verified = CHANNELS.filter((c) => c.verified);
    const sameAs = (orgJsonLd() as { sameAs?: string[] }).sameAs ?? [];
    expect(sameAs).toEqual(verified.map((c) => c.href));
  });
});

describe('catalogNavigationJsonLd — the taxonomy an answer engine reads', () => {
  const subs = { rebar: [{ slug: 'deformed', name: 'میلگرد آجدار' }], pipe: [] };

  it('carries each category’s admin-authored description', () => {
    // Without this the structured data was nine Persian nouns and nothing
    // that answers «آهن‌تایم در این دسته چه می‌فروشد؟».
    const ld = catalogNavigationJsonLd(
      [{ slug: 'rebar', name: 'میلگرد', description: 'میلگرد آجدار و ساده — قلم اصلی اسکلت بتنی.' }],
      subs,
    ) as { itemListElement: { description?: string; hasPart: unknown[] }[] };
    expect(ld.itemListElement[0]!.description).toBe('میلگرد آجدار و ساده — قلم اصلی اسکلت بتنی.');
    expect(ld.itemListElement[0]!.hasPart).toHaveLength(1);
  });

  it('omits the key entirely for a category with none, rather than emitting an empty one', () => {
    const ld = catalogNavigationJsonLd([{ slug: 'pipe', name: 'لوله' }], subs) as {
      itemListElement: Record<string, unknown>[];
    };
    expect(ld.itemListElement[0]).not.toHaveProperty('description');
  });
});
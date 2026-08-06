import { describe, it, expect } from 'vitest';
import { buildMetadata, productJsonLd } from './index';

type Offer = {
  availability?: string;
  price: number;
  businessFunction: string;
  priceSpecification: { valueAddedTaxIncluded: boolean; unitCode: string };
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

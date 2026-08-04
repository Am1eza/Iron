import { describe, it, expect } from 'vitest';
import { productJsonLd } from './seo';

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

/**
 * `generateMetadata` for a product page, priced and price-less.
 *
 * The regression: 195 of production's 748 SKUs (26 %) publish no price, and
 * every one of them shipped
 *
 *   title       «قیمت روز تیرآهن هاش سنگین (HEB) ۲۴»
 *   description «… : تماس بگیرید برای هر کیلوگرم …»
 *
 * — a headline announcing a number over a snippet admitting there isn't one.
 *
 * The half of the rule these tests exist to defend is that the page stays
 * INDEXED (see `_seo/indexability.ts`): the fix is to stop making the claim,
 * not to hide 26 % of the catalog on a flag that flips back as soon as an
 * admin types a price.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const catalog = vi.hoisted(() => ({
  isLiveCatalog: vi.fn(() => true),
  findSku: vi.fn(),
  relatedRows: vi.fn(async () => []),
  priceSeriesWithDates: vi.fn(async () => ({ series: [], dates: [] })),
  getRows: vi.fn(async () => []),
  getCategories: vi.fn(async () => []),
  getBilletReference: vi.fn(async () => null),
  getSubsMap: vi.fn(async () => ({})),
}));

vi.mock('@/lib/server/catalog', () => catalog);

const HEB = {
  slug: 'ibeam-heb-20',
  name: 'تیرآهن هاش سنگین (HEB) ۲۴',
  categoryId: 'ibeam',
  subCategoryId: 'hash-sangin',
  factory: 'ذوب‌آهن اصفهان',
  priceBasis: 'kg' as const,
  current: {
    price: 0,
    priceBasis: 'kg' as const,
    priceHidden: true,
    updatedAt: '2026-02-02T00:00:00.000Z',
  },
};

const priced = {
  ...HEB,
  current: { ...HEB.current, price: 42_000, priceHidden: false },
};

async function metadataFor(row: unknown) {
  catalog.findSku.mockResolvedValue(row);
  vi.resetModules();
  const { generateMetadata } = await import('./page');
  return generateMetadata({
    params: Promise.resolve({ category: 'ibeam', sub: 'hash-sangin', sku: 'ibeam-heb-20' }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  catalog.isLiveCatalog.mockReturnValue(true);
});

describe('SKU metadata · no published price', () => {
  it('asks for an enquiry instead of announcing a price it does not have', async () => {
    const meta = await metadataFor(HEB);

    expect(meta.title).toBe('استعلام قیمت تیرآهن هاش سنگین (HEB) ۲۴');
    expect(meta.title).not.toContain('قیمت روز');
  });

  it('never puts «تماس بگیرید» where a number belongs', async () => {
    const meta = await metadataFor(HEB);

    // The old snippet read «… : تماس بگیرید برای هر کیلوگرم», which parsed
    // as an instruction to phone per kilogram.
    expect(meta.description).not.toContain('تماس بگیرید برای هر');
    expect(meta.description).toContain('قیمت امروز این کالا در آهن‌تایم اعلام نشده است');
    // The denomination is still stated — it is a real fact about the product
    // and it is what the caller will be quoted in.
    expect(meta.description).toContain('کیلوگرم');
    expect(meta.description).toContain('ذوب‌آهن اصفهان');
  });

  it('stays indexable — this is the asymmetry with the empty-taxonomy rule', async () => {
    const meta = await metadataFor(HEB);

    expect(meta.robots).toBeUndefined();
    expect(meta.alternates?.canonical).toBe(
      'https://ahantime.com/prices/ibeam/hash-sangin/ibeam-heb-20',
    );
  });

  it('never renders the withheld `0` sentinel as a price', async () => {
    // `toPriceRow` zeroes a withheld price; the description used to run it
    // through `formatToman` on the other branch, which is how «۰ تومان»
    // reached a search snippet before (W23).
    const meta = await metadataFor(HEB);

    expect(meta.description).not.toContain('۰ تومان');
  });
});

describe('SKU metadata · with a published price', () => {
  it('announces the price, the mill and the denomination', async () => {
    const meta = await metadataFor(priced);

    expect(meta.title).toBe('قیمت روز تیرآهن هاش سنگین (HEB) ۲۴');
    expect(meta.description).toContain('کارخانه ذوب‌آهن اصفهان');
    expect(meta.description).toContain('برای هر کیلوگرم');
    expect(meta.robots).toBeUndefined();
  });

  it('omits the mill clause when the row publishes no mill', async () => {
    const meta = await metadataFor({ ...priced, factory: undefined });

    expect(meta.description).not.toContain('کارخانه');
  });
});

describe('SKU metadata · not this URL’s product', () => {
  it('is noindex when the slug resolves under a different taxonomy path', async () => {
    // Unchanged by this fix, and pinned because the price branch now sits
    // between this guard and the return.
    const meta = await metadataFor({ ...priced, subCategoryId: 'somewhere-else' });

    expect(meta.robots).toMatchObject({ index: false, follow: false });
  });

  it('is noindex when the slug does not resolve at all', async () => {
    const meta = await metadataFor(undefined);

    expect(meta.robots).toMatchObject({ index: false, follow: false });
  });
});

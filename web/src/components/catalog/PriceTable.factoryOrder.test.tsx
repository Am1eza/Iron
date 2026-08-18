import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PriceRow } from '@/lib/types/domain';
import type { SubCat } from '@/lib/data/nav';
import { PriceTable } from './PriceTable';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/prices/rebar',
  useSearchParams: () => new URLSearchParams(),
}));

function row(id: string, factory: string | null, price: number, priceHidden = false): PriceRow {
  return {
    id,
    subCategoryId: 'ribbed',
    categoryId: 'rebar',
    slug: id,
    name: id,
    size: '۱۴',
    factory,
    unit: 'kg',
    isActive: true,
    current: {
      skuId: id,
      price,
      priceHidden,
      unit: 'kg',
      deliveryTime: '۲۴ ساعت',
      vatIncluded: false,
      movementDir: 'flat',
      updatedAt: new Date('2026-08-13T09:00:00Z').toISOString(),
      isStale: false,
    },
  } as PriceRow;
}

const SUBS: SubCat[] = [{ slug: 'ribbed', name: 'آجدار', groupLabel: null }];

const ZOB = 'ذوب‌آهن اصفهان';
const NEY = 'نیشابور';
const KAVIR = 'کویر کاشان';

/** Deliberately inverted against the intended display order: cheapest first is
 *  کویر, then نیشابور, then ذوب‌آهن — so any test that gets the admin order
 *  right could not have got it right by accident. */
const ROWS = [row('zob-14', ZOB, 700_000), row('ney-14', NEY, 600_000), row('kavir-14', KAVIR, 500_000)];

function renderTable(rows: PriceRow[], factoryOrder?: string[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PriceTable
        rows={rows}
        subs={SUBS}
        categoryName="میلگرد"
        categorySlug="rebar"
        factoryOrder={factoryOrder}
      />
    </QueryClientProvider>,
  );
}

/** The factory sections, in render order — each `<h2>` is «قیمت میلگرد {mill}». */
const sectionOrder = () =>
  screen
    .getAllByRole('heading', { level: 2 })
    .map((h) => (h.textContent ?? '').replace('قیمت میلگرد ', '').trim());

describe('PriceTable — admin factory order (US-18.2)', () => {
  it('keeps the cheapest-first order when the admin has arranged nothing', () => {
    // The pre-existing behaviour, pinned: shipping the feature with no data
    // entered must not change a single page.
    renderTable(ROWS);
    expect(sectionOrder()).toEqual([KAVIR, NEY, ZOB]);
  });

  it('treats an empty order the same as no order at all', () => {
    renderTable(ROWS, []);
    expect(sectionOrder()).toEqual([KAVIR, NEY, ZOB]);
  });

  it('leads with the admin order, most expensive mill first if that is the call', () => {
    renderTable(ROWS, [ZOB, NEY, KAVIR]);
    expect(sectionOrder()).toEqual([ZOB, NEY, KAVIR]);
  });

  it('appends everything unplaced after the arranged block, still cheapest-first', () => {
    // The half-filled case — the one that has to be no worse than today.
    // ذوب‌آهن is placed and leads despite being dearest; the other two keep
    // their price order behind it.
    renderTable(ROWS, [ZOB]);
    expect(sectionOrder()).toEqual([ZOB, KAVIR, NEY]);
  });

  it('ignores a name that matches no factory on the page', () => {
    // A mill ordered for this category whose last product was retired, or one
    // filtered out by the sub-category bar — it must not leave a gap or
    // disturb the rest.
    renderTable(ROWS, ['کارخانه‌ای که دیگر کالایی ندارد', NEY]);
    expect(sectionOrder()).toEqual([NEY, KAVIR, ZOB]);
  });

  it('never lets «سایر» outrank an arranged mill', () => {
    // Rows with no factory bucket into «سایر», which the admin has no way to
    // place — so it can only ever be sorted by price, behind the whole
    // arranged block, however cheap it is.
    renderTable([...ROWS, row('no-factory', null, 100_000)], [ZOB]);
    expect(sectionOrder()).toEqual([ZOB, 'سایر', KAVIR, NEY]);
  });

  it('puts a mill whose every price is withheld exactly where the admin placed it', () => {
    // Price-sorted, a factory with nothing publishable sinks to the bottom
    // (Infinity). Placing it must override that — «تماس بگیرید» from ذوب‌آهن
    // is still the row the owner wants seen first.
    const hidden = [row('zob-14', ZOB, 700_000, true), row('ney-14', NEY, 600_000), row('kavir-14', KAVIR, 500_000)];
    renderTable(hidden, [ZOB]);
    expect(sectionOrder()).toEqual([ZOB, KAVIR, NEY]);
  });
});

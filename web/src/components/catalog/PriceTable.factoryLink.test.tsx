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

function row(id: string, factory: string | null, categoryId = 'rebar'): PriceRow {
  return {
    id,
    subCategoryId: 'deformed',
    categoryId,
    slug: id,
    name: id,
    size: '۱۴',
    factory,
    unit: 'kg',
    current: {
      skuId: id,
      price: 70_000,
      unit: 'kg',
      deliveryTime: '۲۴ ساعت',
      vatIncluded: false,
      movementDir: 'flat',
      updatedAt: new Date('2026-08-19T09:00:00Z').toISOString(),
      isStale: false,
    },
  } as PriceRow;
}

const SUBS: SubCat[] = [{ slug: 'deformed', name: 'میلگرد آجدار', groupLabel: null }];

function renderTable(rows: PriceRow[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PriceTable rows={rows} subs={SUBS} categoryName="میلگرد" categorySlug="rebar" />
    </QueryClientProvider>,
  );
}

describe('PriceTable — the کارخانه cell links to the per-factory page', () => {
  it('links a real factory name to /prices/[category]/factory/[factory]', () => {
    renderTable([row('r1', 'ذوب‌آهن اصفهان')]);
    // One cell per row now (the mobile-card copy is gone), and it is linked.
    const links = screen.getAllByRole('link', { name: 'ذوب‌آهن اصفهان' });
    expect(links.length).toBeGreaterThan(0);
    for (const a of links) {
      expect(a).toHaveAttribute('href', '/prices/rebar/factory/zvb-ahn-asfhan');
    }
  });

  it('uses the ROW’s own category, so a cross-listed row still points at its home category', () => {
    // A sheet SKU cross-listed into استیل renders inside /prices/steel, but its
    // facet page lives under the category it actually belongs to.
    renderTable([row('r2', 'فولاد مبارکه', 'sheet')]);
    for (const a of screen.getAllByRole('link', { name: 'فولاد مبارکه' })) {
      expect(a).toHaveAttribute('href', '/prices/sheet/factory/fvlad-mbarkh');
    }
  });

  it('leaves a row with no factory as plain «نامشخص» text — there is no page to point at', () => {
    renderTable([row('r3', null)]);
    expect(screen.queryByRole('link', { name: 'نامشخص' })).toBeNull();
    expect(screen.getAllByText('نامشخص').length).toBeGreaterThan(0);
  });

  it('does not link a factory literally stored as «نامشخص» either', () => {
    renderTable([row('r4', 'نامشخص')]);
    expect(screen.queryByRole('link', { name: 'نامشخص' })).toBeNull();
  });
});

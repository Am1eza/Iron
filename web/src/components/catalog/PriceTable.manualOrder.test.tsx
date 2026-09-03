import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PriceRow } from '@/lib/types/domain';
import type { SubCat } from '@/lib/data/nav';
import { PriceTable } from './PriceTable';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/prices/sheet',
  useSearchParams: () => new URLSearchParams(),
}));

function row(id: string, size: string, order: number, price = 500_000): PriceRow {
  return {
    id,
    subCategoryId: 'cut',
    categoryId: 'sheet',
    slug: id,
    name: id,
    size,
    factory: 'فولاد مبارکه',
    order,
    unit: 'kg',
    current: {
      skuId: id,
      price,
      unit: 'kg',
      deliveryTime: '۲۴ ساعت',
      vatIncluded: false,
      movementDir: 'flat',
      updatedAt: new Date('2026-08-28T09:00:00Z').toISOString(),
      isStale: false,
    },
  } as PriceRow;
}

const SUBS: SubCat[] = [{ slug: 'cut', name: 'برش‌خورده', groupLabel: null }];

function renderTable(rows: PriceRow[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PriceTable rows={rows} subs={SUBS} categoryName="ورق" categorySlug="sheet" />
    </QueryClientProvider>,
  );
}

/** Row names, in the order they actually render — read off the per-row
 *  compare-checkbox aria-label rather than table-role plumbing, so this holds
 *  even if the ≤767px reflow changes the underlying markup. */
const rowOrder = () =>
  screen
    .getAllByLabelText(/^افزودن .+ به مقایسه$/)
    .map((el) => (el.getAttribute('aria-label') ?? '').replace(/^افزودن /, '').replace(/ به مقایسه$/, ''));

describe('PriceTable — admin per-SKU display order (owner request, 1405/06)', () => {
  it('keeps the plain size sort when nobody has ranked anything', () => {
    // Pinned pre-existing behaviour: two rows sharing a size string («۲») fall
    // back to whatever order they were given in, since the numeric size parse
    // alone cannot distinguish them — exactly the failure that motivated this
    // feature.
    const rows = [row('cut-2', '۲', 0), row('roll-2', '۲', 0), row('three', '۳', 0)];
    renderTable(rows);
    expect(rowOrder()).toEqual(['cut-2', 'roll-2', 'three']);
  });

  it('lets the admin put «۲ رول» before «۲ برش‌خورده» despite the identical size', () => {
    const rows = [row('cut-2', '۲', 2), row('roll-2', '۲', 1), row('three', '۳', 3)];
    renderTable(rows);
    expect(rowOrder()).toEqual(['roll-2', 'cut-2', 'three']);
  });

  it('leads with ranked rows and falls back to the size sort for the rest', () => {
    // Only one row ranked — the owner has not touched the others yet, so
    // they keep behaving exactly as before amongst themselves.
    const rows = [row('twenty', '۲۰', 0), row('four', '۴', 0), row('ranked', '۱۰', 1)];
    renderTable(rows);
    expect(rowOrder()).toEqual(['ranked', 'four', 'twenty']);
  });

  it('leaves an explicit price sort to the visitor — manual order only governs the default «سایز» view', () => {
    // `costly` is ranked ahead of `cheap` (order 1 vs 2), but a visitor who
    // explicitly asks to sort by price is making their own choice, unrelated
    // to the owner's display arrangement — it must win outright.
    const rows = [row('cheap', '۲', 2, 100_000), row('costly', '۲', 1, 900_000)];
    renderTable(rows);
    expect(rowOrder()).toEqual(['costly', 'cheap']);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'price' } });
    expect(rowOrder()).toEqual(['cheap', 'costly']);
  });
});

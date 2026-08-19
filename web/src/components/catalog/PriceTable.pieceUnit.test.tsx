import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PriceRow, PriceUnit } from '@/lib/types/domain';
import type { SubCat } from '@/lib/data/nav';
import { PriceTable } from './PriceTable';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/prices/rebar',
  useSearchParams: () => new URLSearchParams(),
}));

function row(
  id: string,
  unit: PriceUnit,
  extra: { sub?: string; weight?: number | undefined } = {},
): PriceRow {
  return {
    id,
    subCategoryId: extra.sub ?? 'coupler',
    categoryId: 'rebar',
    slug: id,
    name: id,
    size: '۲۰',
    factory: 'ذوب‌آهن اصفهان',
    unit,
    theoreticalWeightKg: extra.weight,
    isActive: true,
    current: {
      skuId: id,
      price: 86_250,
      unit,
      deliveryTime: '۲۴ ساعت',
      vatIncluded: false,
      movementDir: 'flat',
      updatedAt: new Date('2026-08-19T09:00:00Z').toISOString(),
      isStale: false,
    },
  } as PriceRow;
}

const SUBS: SubCat[] = [
  { slug: 'coupler', name: 'کوپلر میلگرد', groupLabel: null },
  { slug: 'deformed', name: 'میلگرد آجدار', groupLabel: null },
];

function renderTable(rows: PriceRow[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PriceTable rows={rows} subs={SUBS} categoryName="میلگرد" categorySlug="rebar" />
    </QueryClientProvider>,
  );
}

describe('PriceTable — the «عدد» (piece) unit', () => {
  it('captions a piece row «تومان / عدد», not «تومان / کیلوگرم»', () => {
    // A piece price is the one that is NOT per kilogram — see PRICE_UNIT_VALUES.
    renderTable([row('کوپلر ۲۰', 'piece')]);
    expect(screen.getAllByText('تومان / عدد').length).toBeGreaterThan(0);
    expect(screen.queryByText('تومان / کیلوگرم')).toBeNull();
  });

  it('keeps the kg caption for every other unit', () => {
    renderTable([row('میلگرد ۲۰', 'branch', { sub: 'deformed', weight: 29.6 })]);
    expect(screen.getAllByText('تومان / کیلوگرم').length).toBeGreaterThan(0);
  });

  it('renders «نامشخص» in the weight column for a piece row rather than something broken', () => {
    // A کوپلر has no branch weight, and the backfill deliberately stores null.
    renderTable([row('کوپلر ۲۰', 'piece')]);
    const table = screen.getByRole('table');
    const headers = within(table).getAllByRole('columnheader');
    const weightCol = headers.findIndex((h) => h.textContent?.includes('وزن'));
    expect(weightCol).toBeGreaterThan(-1);
    const tr = screen.getByRole('rowheader', { name: 'کوپلر ۲۰' }).closest('tr')!;
    // -1: the rowheader occupies a cell that is not in the `td` list.
    expect(tr.querySelectorAll('td')[weightCol - 1]?.textContent).toBe('نامشخص');
  });

  it('prints the page-wide note in «عدد» when every row is piece-priced', () => {
    renderTable([row('کوپلر ۲۰', 'piece'), row('کوپلر ۲۲', 'piece')]);
    expect(screen.getByText('قیمت‌ها به تومان و برای هر عدد است.')).toBeInTheDocument();
  });

  it('drops the page-wide note entirely when the two bases are mixed', () => {
    // «قیمت‌ها … برای هر کیلوگرم است» would be a blanket claim that is wrong
    // for the coupler rows sitting right under it.
    renderTable([
      row('کوپلر ۲۰', 'piece'),
      row('میلگرد ۲۰', 'kg', { sub: 'deformed', weight: 29.6 }),
    ]);
    expect(screen.queryByText(/قیمت‌ها به تومان و برای هر/)).toBeNull();
    // …and each row still captions itself.
    expect(screen.getAllByText('تومان / عدد').length).toBeGreaterThan(0);
    expect(screen.getAllByText('تومان / کیلوگرم').length).toBeGreaterThan(0);
  });
});

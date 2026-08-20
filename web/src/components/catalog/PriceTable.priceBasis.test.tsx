import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PriceBasis, PriceRow, PriceUnit } from '@/lib/types/domain';
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
  priceBasis: PriceBasis = 'kg',
  extra: { sub?: string; weight?: number | undefined; lengthM?: number } = {},
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
    priceBasis,
    branchLengthM: extra.lengthM,
    theoreticalWeightKg: extra.weight,
    isActive: true,
    current: {
      skuId: id,
      price: 86_250,
      unit,
      priceBasis,
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

describe('PriceTable — the price-basis caption', () => {
  // One case per member of PRICE_BASIS_VALUES. Each of these was «تومان /
  // کیلوگرم» before the column existed, which on a 15-metre copper coil read
  // as «۱۶٬۴۹۲٬۳۸۰ تومان / کیلوگرم».
  it.each([
    ['kg', 'kg', undefined, 'تومان / کیلوگرم'],
    ['piece', 'piece', undefined, 'تومان / عدد'],
    ['sheet', 'sheet', undefined, 'تومان / برگ'],
    ['sqm', 'sqm', undefined, 'تومان / متر مربع'],
    ['branch', 'branch', undefined, 'تومان / شاخه'],
    ['coil', 'branch', undefined, 'تومان / کلاف'],
  ] as const)('captions a %s-priced row', (basis, unit, lengthM, caption) => {
    renderTable([row('کالا', unit, basis, { weight: undefined, lengthM })]);
    expect(screen.getAllByText(caption).length).toBeGreaterThan(0);
  });

  it('names the branch length in the caption when the SKU records one', () => {
    // «تومان / کلاف ۱۵ متری» — لوله مسی is quoted for a whole 15 m coil, and
    // the length is the difference between an honest caption and a bare one.
    renderTable([row('لوله مسی', 'branch', 'coil', { lengthM: 15 })]);
    expect(screen.getAllByText('تومان / کلاف ۱۵ متری').length).toBeGreaterThan(0);
    expect(screen.queryByText('تومان / کیلوگرم')).toBeNull();
  });

  it('never appends a length to a kilogram basis', () => {
    // A نبشی is per-kilogram AND 6 m long; «کیلوگرم ۶ متری» is nonsense.
    renderTable([row('نبشی ۱۰', 'branch', 'kg', { weight: 94.3, lengthM: 6 })]);
    expect(screen.getAllByText('تومان / کیلوگرم').length).toBeGreaterThan(0);
    expect(screen.queryByText(/کیلوگرم ۶ متری/)).toBeNull();
  });

  it('renders «نامشخص» in the weight column for a whole-item row rather than something broken', () => {
    // A کوپلر has no branch weight, and the backfill deliberately stores null.
    renderTable([row('کوپلر ۲۰', 'piece', 'piece')]);
    const table = screen.getByRole('table');
    const headers = within(table).getAllByRole('columnheader');
    const weightCol = headers.findIndex((h) => h.textContent?.includes('وزن'));
    expect(weightCol).toBeGreaterThan(-1);
    const tr = screen.getByRole('rowheader', { name: 'کوپلر ۲۰' }).closest('tr')!;
    // -1: the rowheader occupies a cell that is not in the `td` list.
    expect(tr.querySelectorAll('td')[weightCol - 1]?.textContent).toBe('نامشخص');
  });

  it('prints the page-wide note in «عدد» when every row is piece-priced', () => {
    renderTable([row('کوپلر ۲۰', 'piece', 'piece'), row('کوپلر ۲۲', 'piece', 'piece')]);
    expect(screen.getByText('قیمت‌ها به تومان و برای هر عدد است.')).toBeInTheDocument();
  });

  it('drops the page-wide note entirely when the two bases are mixed', () => {
    // «قیمت‌ها … برای هر کیلوگرم است» would be a blanket claim that is wrong
    // for the coupler rows sitting right under it.
    renderTable([
      row('کوپلر ۲۰', 'piece', 'piece'),
      row('میلگرد ۲۰', 'kg', 'kg', { sub: 'deformed', weight: 29.6 }),
    ]);
    expect(screen.queryByText(/قیمت‌ها به تومان و برای هر/)).toBeNull();
    // …and each row still captions itself — including the desktop table, which
    // before this had nothing anywhere on it saying what the numbers are per.
    expect(screen.getAllByText('تومان / عدد').length).toBeGreaterThan(0);
    expect(screen.getAllByText('تومان / کیلوگرم').length).toBeGreaterThan(0);
    const tr = screen.getByRole('rowheader', { name: 'کوپلر ۲۰' }).closest('tr')!;
    expect(tr.textContent).toContain('عدد');
  });

  it('omits the length from the page-wide note when the rows disagree about it', () => {
    // 6 m and 12 m نبشی are both real; picking one for the whole table would
    // be exactly the per-line guess the per-SKU column exists to remove.
    renderTable([
      row('شاخه ۶', 'branch', 'branch', { lengthM: 6 }),
      row('شاخه ۱۲', 'branch', 'branch', { lengthM: 12 }),
    ]);
    expect(screen.getByText('قیمت‌ها به تومان و برای هر شاخه است.')).toBeInTheDocument();
  });
});

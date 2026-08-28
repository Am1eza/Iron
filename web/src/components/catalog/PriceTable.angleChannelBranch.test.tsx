import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PriceRow } from '@/lib/types/domain';
import type { SubCat } from '@/lib/data/nav';
import { PriceTable } from './PriceTable';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/prices/angle-channel',
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * نبشی و ناودانی after the owner's 1405/06 request: «جای گرید بنویسیم شاخه که
 * ما اونجا مثلا بنویسیم ۶ متری یا ۱۲ متری».
 *
 * The swap costs nothing because the column it replaces was empty: `grade` is
 * null on every live row of all six affected subs, so their «گرید» column was
 * printing «نامشخص» on every row of every page. وال پست is the exception the
 * owner confirmed — its grade holds «ضخامت ۲» on all 8 live rows, so it keeps
 * the column.
 *
 * Sub slugs are the LIVE ones. `data/nav.ts` is a mock fixture by its own
 * header and cannot be trusted for this.
 */
function row(
  id: string,
  subCategoryId: string,
  extra: { grade?: string; branchLengthM?: number } = {},
): PriceRow {
  return {
    id,
    subCategoryId,
    categoryId: 'angle-channel',
    slug: id,
    name: id,
    size: '۵',
    factory: 'ناب تبریز',
    unit: 'kg',
    priceBasis: 'kg',
    isActive: true,
    ...extra,
    current: {
      skuId: id,
      price: 480_000,
      unit: 'kg',
      priceBasis: 'kg',
      deliveryTime: '۲۴ ساعت',
      vatIncluded: false,
      movementDir: 'flat',
      updatedAt: new Date('2026-08-28T09:00:00Z').toISOString(),
      isStale: false,
    },
  } as PriceRow;
}

const SUBS: SubCat[] = [
  { slug: 'nabshi', name: 'نبشی', groupLabel: null },
  { slug: 'angle-unequal', name: 'نبشی بال نامساوی', groupLabel: null },
  { slug: 'spot', name: 'نبشی لقمه', groupLabel: null },
  { slug: 'channel-light', name: 'ناودانی سبک', groupLabel: null },
  { slug: 'channel-heavy', name: 'ناودانی سنگین', groupLabel: null },
  { slug: 'separi', name: 'سپری', groupLabel: null },
  { slug: 'val-post', name: 'وال پست', groupLabel: null },
];

const ROWS = [
  row('nabshi-6', 'nabshi', { branchLengthM: 6 }),
  row('nabshi-12', 'nabshi', { branchLengthM: 12 }),
  row('nabshi-none', 'nabshi'),
  row('channel-6', 'channel-light', { branchLengthM: 6 }),
  row('separi-6', 'separi', { branchLengthM: 6 }),
  row('valpost-1', 'val-post', { grade: 'ضخامت ۲' }),
];

function renderTable(initialSub: string | null = null, rows: PriceRow[] = ROWS) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PriceTable
        rows={rows}
        subs={SUBS}
        categoryName="نبشی و ناودانی"
        categorySlug="angle-channel"
        initialSub={initialSub}
      />
    </QueryClientProvider>,
  );
}

/** The cell under a named column for a given product row. */
function cellFor(product: string, column: string): string {
  const tr = screen.getByRole('rowheader', { name: product }).closest('tr')!;
  const headers = within(tr.closest('table')!).getAllByRole('columnheader');
  const col = headers.findIndex((h) => h.textContent === column);
  expect(col, `column «${column}» is on the table`).toBeGreaterThan(-1);
  return tr.querySelectorAll('td')[col - 1]?.textContent ?? '';
}

describe('PriceTable — نبشی و ناودانی publishes «شاخه» instead of «گرید»', () => {
  it('draws «شاخه» and drops «گرید» on نبشی', () => {
    renderTable('nabshi');
    expect(screen.getByRole('columnheader', { name: 'شاخه' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'گرید' })).toBeNull();
  });

  it('prints «۶ متری» and «۱۲ متری», not «۶ متر»', () => {
    renderTable('nabshi');
    expect(cellFor('nabshi-6', 'شاخه')).toBe('۶ متری');
    expect(cellFor('nabshi-12', 'شاخه')).toBe('۱۲ متری');
  });

  it('says «نامشخص» where no length is recorded — never a dash', () => {
    // A نبشی IS sold in some شاخه; we just have not recorded this one's.
    renderTable('nabshi');
    expect(cellFor('nabshi-none', 'شاخه')).toBe('نامشخص');
  });

  it('does the same on ناودانی and سپری', async () => {
    const user = userEvent.setup();
    renderTable('channel-light');
    expect(cellFor('channel-6', 'شاخه')).toBe('۶ متری');
    await user.click(screen.getByRole('button', { name: 'سپری' }));
    expect(cellFor('separi-6', 'شاخه')).toBe('۶ متری');
    expect(screen.queryByRole('columnheader', { name: 'گرید' })).toBeNull();
  });

  it('leaves وال پست on «گرید», still publishing «ضخامت ۲»', async () => {
    // The one sub whose grade holds real data. Swapping it would delete a
    // value an admin deliberately entered.
    const user = userEvent.setup();
    renderTable('nabshi');
    await user.click(screen.getByRole('button', { name: 'وال پست' }));
    expect(screen.getByRole('columnheader', { name: 'گرید' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'شاخه' })).toBeNull();
    expect(cellFor('valpost-1', 'گرید')).toBe('ضخامت ۲');
  });

  it('keeps the mixed «همه» view on «گرید», dashing the swapped subs', async () => {
    // Same rule پروفیل's mixed view follows: وال پست still publishes its
    // grade, and a sub that traded the column away reads «—», not «نامشخص».
    renderTable(null);
    expect(screen.getByRole('columnheader', { name: 'گرید' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'شاخه' })).toBeNull();
    expect(cellFor('valpost-1', 'گرید')).toBe('ضخامت ۲');
    expect(cellFor('nabshi-6', 'گرید')).toBe('—');
  });

  it('does not touch the «وزن شاخه» column it now sits beside', () => {
    // Two similarly-named columns: «شاخه» is the length sold, «وزن شاخه» is
    // the theoretical weight. They must both exist and stay distinct.
    renderTable('nabshi');
    expect(screen.getByRole('columnheader', { name: 'شاخه' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'وزن شاخه' })).toBeInTheDocument();
  });
});

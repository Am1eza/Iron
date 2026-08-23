import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PriceRow } from '@/lib/types/domain';
import type { SubCat } from '@/lib/data/nav';
import { PriceTable } from './PriceTable';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/prices/steel',
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * استیل after the owner's employer's 1405/06 instruction: «کلاک کارخانه رو
 * حذف بکنیم، فقط محصول رو می‌ذاریم، آلیاژش رو می‌نویسیم و طولش رو».
 *
 * The category is imported stainless end to end, so — unlike پروفیل, where
 * the removal is a per-sub list with «ساختمانی» deliberately exempt — no sub
 * in it keeps a mill. That makes this table the case the پروفیل file cannot
 * cover: a category where NO row can carry a factory, in the mixed «همه» view
 * as well as under every filter.
 *
 * `factory: undefined` here is what `catalogRepo.toPriceRow` already delivers
 * (it withholds the stored «چین»/«تایوان» origin strings at the DTO
 * boundary); this file is about what the table then draws.
 */
function row(
  id: string,
  subCategoryId: string,
  extra: { grade?: string; branchLengthM?: number; factory?: string } = {},
): PriceRow {
  return {
    id,
    subCategoryId,
    categoryId: 'steel',
    slug: id,
    name: id,
    size: '۴۰×۴۰',
    unit: 'kg',
    priceBasis: 'kg',
    isActive: true,
    ...extra,
    current: {
      skuId: id,
      price: 520_000,
      unit: 'kg',
      priceBasis: 'kg',
      deliveryTime: '۲۴ ساعت',
      vatIncluded: false,
      movementDir: 'flat',
      updatedAt: new Date('2026-08-23T09:00:00Z').toISOString(),
      isStale: false,
    },
  } as PriceRow;
}

const SUBS: SubCat[] = [
  { slug: 'angle', name: 'نبشی استیل', groupLabel: null },
  { slug: 'channel', name: 'ناودانی استیل', groupLabel: null },
  { slug: 'pipe', name: 'لوله استیل', groupLabel: null },
  { slug: 'profile', name: 'پروفیل استیل', groupLabel: null },
];

const ROWS = [
  row('angle-40', 'angle', { grade: '304', branchLengthM: 6 }),
  row('channel-10', 'channel', { grade: '304L', branchLengthM: 6 }),
  row('pipe-2', 'pipe', { grade: '316L', branchLengthM: 6 }),
  row('profile-40', 'profile', { grade: '201', branchLengthM: 6 }),
];

function renderTable(rows: PriceRow[] = ROWS, initialSub: string | null = null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PriceTable
        rows={rows}
        subs={SUBS}
        categoryName="استیل"
        categorySlug="steel"
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
  // The leading `<th>` is the compare checkbox and the product name is a
  // `<th scope="row">`, so the Nth header maps to the (N-1)th `<td>`.
  return tr.querySelectorAll('td')[col - 1]?.textContent ?? '';
}

describe('PriceTable — استیل is imported, so it has no کارخانه at all', () => {
  it('draws no factory column, no sections and no mill count in the mixed view', () => {
    renderTable();
    expect(screen.queryByRole('columnheader', { name: 'کارخانه' })).toBeNull();
    // No `<details>` disclosure: with nothing to group by, one flat table.
    expect(document.querySelector('details')).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'پرش به کارخانه' })).toBeNull();
    // Nor «محل تولید», the پروفیل replacement: «چین»/«تایوان» are countries,
    // not Iranian producing cities, so nothing resolves and the fallback
    // structure is simply one table.
    expect(screen.queryByText(/کارخانه|محل تولید/)).toBeNull();
    expect(screen.getByRole('table', { name: 'قیمت استیل' })).toBeInTheDocument();
  });

  it('publishes «آلیاژ» and «طول شاخه» on every sub', async () => {
    const user = userEvent.setup();
    renderTable();
    for (const [sub, product, alloy] of [
      ['نبشی استیل', 'angle-40', '304'],
      ['ناودانی استیل', 'channel-10', '304L'],
      ['لوله استیل', 'pipe-2', '316L'],
      ['پروفیل استیل', 'profile-40', '201'],
    ] as const) {
      await user.click(screen.getByRole('button', { name: sub }));
      expect(screen.queryByRole('columnheader', { name: 'کارخانه' })).toBeNull();
      expect(cellFor(product, 'آلیاژ')).toBe(alloy);
      expect(cellFor(product, 'طول شاخه')).toBe('۶ متر');
      expect(screen.queryByRole('columnheader', { name: 'گرید' })).toBeNull();
    }
  });

  it('says «نامشخص» for a length nobody has entered — never a dash', () => {
    // A dash would claim استیل products have no branch length; they do, we
    // just have not recorded this one.
    renderTable([row('angle-50', 'angle', { grade: '304' })]);
    expect(cellFor('angle-50', 'طول شاخه')).toBe('نامشخص');
  });
});

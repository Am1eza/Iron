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
 * استیل after the owner's 1405/06/08 confirmation: matching ahanonline.com's
 * exact columns overrides the prior 1405/06 "no factory, آلیاژ+طول شاخه
 * everywhere" instruction (verified per sub against the live ahanonline.com
 * page). The factory removal itself stands — ahanonline shows no
 * factory/برند column for any استیل sub either — but the attribute columns
 * are now per-sub: نبشی/ناودانی استیل keep «آلیاژ» with no length; پروفیل
 * استیل keeps «آلیاژ» and gains «حالت»; لوله استیل ALSO keeps «آلیاژ»
 * alongside its own «حالت»+«رده» — corrected 1405/06/09 after re-checking
 * the live page, which does publish آلیاژ (316L at 1,700,000 T/kg on the
 * page today, up to 2.3× apart from 304L), contrary to the earlier note here
 * that it did not.
 *
 * `factory: undefined` here is what `catalogRepo.toPriceRow` already delivers
 * (it withholds the stored «چین»/«تایوان» origin strings at the DTO
 * boundary); this file is about what the table then draws.
 */
function row(
  id: string,
  subCategoryId: string,
  extra: {
    grade?: string;
    condition?: string;
    schedule?: string;
    branchLengthM?: number;
    factory?: string;
    dimensions?: string;
  } = {},
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
  row('angle-40', 'angle', { grade: '304', dimensions: '2' }),
  row('channel-10', 'channel', { grade: '304L', dimensions: '3' }),
  row('pipe-2', 'pipe', { grade: '316L', condition: 'درزدار', schedule: '۴۰' }),
  row('profile-40', 'profile', { grade: '201', condition: 'گالوانیزه', dimensions: '2' }),
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

  it('publishes «آلیاژ» (no length) on نبشی/ناودانی استیل', async () => {
    const user = userEvent.setup();
    renderTable();
    for (const [sub, product, alloy] of [
      ['نبشی استیل', 'angle-40', '304'],
      ['ناودانی استیل', 'channel-10', '304L'],
    ] as const) {
      await user.click(screen.getByRole('button', { name: sub }));
      expect(screen.queryByRole('columnheader', { name: 'کارخانه' })).toBeNull();
      expect(cellFor(product, 'آلیاژ')).toBe(alloy);
      expect(screen.queryByRole('columnheader', { name: 'طول شاخه' })).toBeNull();
      expect(screen.queryByRole('columnheader', { name: 'گرید' })).toBeNull();
    }
  });

  it('publishes «آلیاژ»+«حالت» on پروفیل استیل, no length', async () => {
    const user = userEvent.setup();
    renderTable();
    await user.click(screen.getByRole('button', { name: 'پروفیل استیل' }));
    expect(cellFor('profile-40', 'آلیاژ')).toBe('201');
    expect(cellFor('profile-40', 'حالت')).toBe('گالوانیزه');
    expect(screen.queryByRole('columnheader', { name: 'طول شاخه' })).toBeNull();
  });

  it('publishes «آلیاژ»+«حالت»+«رده» on لوله استیل', async () => {
    const user = userEvent.setup();
    renderTable();
    await user.click(screen.getByRole('button', { name: 'لوله استیل' }));
    expect(cellFor('pipe-2', 'آلیاژ')).toBe('316L');
    expect(cellFor('pipe-2', 'حالت')).toBe('درزدار');
    expect(cellFor('pipe-2', 'رده')).toBe('۴۰');
  });

  it('says «نامشخص» for an آلیاژ nobody has entered on نبشی استیل — never a dash', async () => {
    const user = userEvent.setup();
    // A dash would claim نبشی استیل products have no alloy; they do, we just
    // have not recorded this one.
    renderTable([row('angle-50', 'angle')]);
    await user.click(screen.getByRole('button', { name: 'نبشی استیل' }));
    expect(cellFor('angle-50', 'آلیاژ')).toBe('نامشخص');
  });
});

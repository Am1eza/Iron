import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PriceRow } from '@/lib/types/domain';
import type { SubCat } from '@/lib/data/nav';
import { PriceTable } from './PriceTable';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/prices/angle-channel/nabshi',
  useSearchParams: () => new URLSearchParams(),
}));

const SUBS: SubCat[] = [
  { slug: 'nabshi', name: 'نبشی بال مساوی', groupLabel: null },
  { slug: 'angle-unequal', name: 'نبشی بال نامساوی', groupLabel: null },
  { slug: 'spot', name: 'نبشی لقمه', groupLabel: null },
  { slug: 'val-post', name: 'وال‌پست', groupLabel: null },
  { slug: 'tbar', name: 'تی‌بار', groupLabel: null },
];

function row(subCategoryId: string): PriceRow {
  return {
    id: subCategoryId,
    subCategoryId,
    categoryId: 'angle-channel',
    slug: subCategoryId,
    name: subCategoryId,
    size: '۴۰',
    dimensions: '۴',
    factory: 'فولاد مشهد',
    unit: 'kg',
    current: {
      skuId: subCategoryId,
      price: 500_000,
      unit: 'kg',
      deliveryTime: '۲۴ ساعت',
      vatIncluded: false,
      movementDir: 'flat',
      updatedAt: new Date('2026-08-28T09:00:00Z').toISOString(),
      isStale: false,
    },
  } as PriceRow;
}

function renderTable(initialSub: string | null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PriceTable
        rows={SUBS.map((sub) => row(sub.slug))}
        subs={SUBS}
        categoryName="نبشی و ناودانی"
        categorySlug="angle-channel"
        initialSub={initialSub}
      />
    </QueryClientProvider>,
  );
}

describe('PriceTable — نبشی wall thickness scope', () => {
  it.each(['nabshi', 'angle-unequal', 'spot'])('shows a ضخامت column on %s', (subCategoryId) => {
    renderTable(subCategoryId);
    expect(screen.getByRole('columnheader', { name: 'ضخامت' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'ابعاد' })).not.toBeInTheDocument();
    expect(document.querySelector('td[data-label="ضخامت"]')).not.toBeNull();
  });

  it.each([null, 'tbar'])(
    'keeps the shared wall-thickness column hidden for %s',
    (subCategoryId) => {
      renderTable(subCategoryId);
      expect(screen.queryByRole('columnheader', { name: 'ضخامت' })).not.toBeInTheDocument();
      expect(screen.queryByRole('columnheader', { name: 'ابعاد' })).not.toBeInTheDocument();
      expect(document.querySelector('td[data-label="ضخامت"]')).toBeNull();
    },
  );

  it('shows «ضخامت» on وال‌پست from its own grade column, not the shared wall-thickness one', () => {
    // 1405/06/08: وال‌پست's «گرید» was relabelled «ضخامت» to match
    // ahanonline (see catalogLabels' ANGLE_CHANNEL_THICKNESS_GRADE_SUBS) —
    // a coincidentally identical header text to the shared نبشی wall-
    // thickness column above, but a different column reading a different
    // field (`grade`, not `dimensions`). Exactly one «ضخامت» column must
    // render, not two.
    renderTable('val-post');
    const headers = screen.getAllByRole('columnheader', { name: 'ضخامت' });
    expect(headers).toHaveLength(1);
    expect(screen.queryByRole('columnheader', { name: 'ابعاد' })).not.toBeInTheDocument();
    // The row helper above sets `dimensions` but not `grade`, so the value
    // shown must be «نامشخص» (unrecorded grade), never the `dimensions`
    // value «۴» — proof the column is reading the right field.
    expect(document.querySelector('td[data-label="ضخامت"]')?.textContent).toBe('نامشخص');
  });

  it('publishes وال‌پست’s `dimensions` as «بال», the header ahanonline leads with', () => {
    // 1405/06/09: the field this sub had never used now carries the flange
    // width. It must land under «بال» and stay out of the «ضخامت» column
    // beside it, which reads `grade` — the two facts share a row, not a cell.
    renderTable('val-post');
    expect(screen.getByRole('columnheader', { name: 'بال' })).toBeInTheDocument();
    expect(document.querySelector('td[data-label="بال"]')?.textContent).toBe('۴');
  });
});

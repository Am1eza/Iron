import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PriceRow } from '@/lib/types/domain';
import type { SubCat } from '@/lib/data/nav';
import { PriceTable } from './PriceTable';

// Nothing under test navigates; the toolbar only reads the search params to
// pre-select a sub-category on a deep link.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/prices/pipe',
  useSearchParams: () => new URLSearchParams(),
}));

function row(id: string, subCategoryId: string): PriceRow {
  return {
    id,
    subCategoryId,
    categoryId: 'c6',
    slug: id,
    name: id,
    size: '۳ اینچ',
    factory: 'لوله سپاهان',
    unit: 'kg',
    current: {
      skuId: id,
      price: 500_000,
      unit: 'kg',
      deliveryTime: '۲۴ ساعت',
      vatIncluded: false,
      movementDir: 'flat',
      updatedAt: new Date('2026-08-13T09:00:00Z').toISOString(),
      isStale: false,
    },
  } as PriceRow;
}

function renderTable(subs: SubCat[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PriceTable
        rows={[row('pipe-seamless-1', 'seamless-internal'), row('pipe-gas-1', 'gas')]}
        subs={subs}
        categoryName="لوله"
        categorySlug="pipe"
      />
    </QueryClientProvider>,
  );
}

/** Mirrors the live pipe taxonomy after the seamless split: two grouped subs
 *  sharing «مانیسمان», the rest ungrouped. */
const PIPE_SUBS: SubCat[] = [
  { slug: 'seamless-internal', name: 'لوله مانیسمان داخلی', groupLabel: 'مانیسمان' },
  { slug: 'seamless-external', name: 'لوله مانیسمان خارجی', groupLabel: 'مانیسمان' },
  { slug: 'gas', name: 'گازی', groupLabel: null },
  { slug: 'spiral', name: 'اسپیرال', groupLabel: null },
];

describe('PriceTable — sub-category filter bar grouping', () => {
  it('clusters subs sharing a groupLabel under one heading, with each as its own chip', () => {
    renderTable(PIPE_SUBS);
    const group = screen.getByRole('group', { name: 'مانیسمان' });
    // The heading appears exactly once even though two subs carry the label.
    expect(screen.getAllByText('مانیسمان')).toHaveLength(1);
    expect(within(group).getByRole('button', { name: 'لوله مانیسمان داخلی' })).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: 'لوله مانیسمان خارجی' })).toBeInTheDocument();
  });

  it('leaves ungrouped subs (null groupLabel) as bare standalone chips', () => {
    renderTable(PIPE_SUBS);
    const group = screen.getByRole('group', { name: 'مانیسمان' });
    for (const name of ['گازی', 'اسپیرال', 'همه']) {
      const chip = screen.getByRole('button', { name });
      expect(chip).toBeInTheDocument();
      expect(group.contains(chip)).toBe(false);
    }
  });

  it('wraps no chip in a group when nothing carries a groupLabel', () => {
    // The table renders unrelated role="group" nodes of its own (the toolbar
    // controls), so this asserts on the chips themselves rather than counting
    // groups globally.
    renderTable([
      { slug: 'gas', name: 'گازی', groupLabel: null },
      { slug: 'spiral', name: 'اسپیرال' },
    ]);
    for (const name of ['گازی', 'اسپیرال', 'همه']) {
      const chip = screen.getByRole('button', { name });
      expect(chip).toBeInTheDocument();
      expect(chip.closest('[role="group"]')).toBeNull();
    }
  });
});

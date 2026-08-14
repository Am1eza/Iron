import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PriceRow } from '@/lib/types/domain';
import { SkuDetail } from './SkuDetail';

// `useAuth` (and the related-product links) reach for the App Router; nothing
// under test navigates, so a stub router is enough.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

function row(categoryId: string, overrides: Partial<PriceRow> = {}): PriceRow {
  return {
    id: 'sku-1',
    subCategoryId: 'black',
    categoryId,
    slug: 'test-sku',
    name: 'کالای آزمایشی',
    size: '۲',
    factory: 'فولاد مبارکه',
    unit: 'kg',
    isActive: true,
    current: {
      skuId: 'sku-1',
      price: 500_000,
      unit: 'kg',
      deliveryTime: '۲۴ ساعت',
      vatIncluded: false,
      movementDir: 'flat',
      updatedAt: new Date('2026-08-13T09:00:00Z').toISOString(),
      isStale: false,
    },
    ...overrides,
  };
}

/** The alert bell inside the hero subscribes to a query — give it a client. */
function renderDetail(categoryId: string, overrides: Partial<PriceRow> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SkuDetail row={row(categoryId, overrides)} related={[]} series={[1, 2]} />
    </QueryClientProvider>,
  );
}

describe('SkuDetail — the size attribute is labelled per category', () => {
  it('calls it ضخامت for a ورق product', () => {
    renderDetail('sheet');
    expect(screen.getByRole('rowheader', { name: 'ضخامت' })).toBeInTheDocument();
    expect(screen.queryByRole('rowheader', { name: 'سایز' })).not.toBeInTheDocument();
  });

  it('leaves it as سایز for میلگرد', () => {
    renderDetail('rebar');
    expect(screen.getByRole('rowheader', { name: 'سایز' })).toBeInTheDocument();
    expect(screen.queryByRole('rowheader', { name: 'ضخامت' })).not.toBeInTheDocument();
  });
});

describe('SkuDetail — «ابعاد» (ورق width×length)', () => {
  it('shows the row once a ورق product has dimensions recorded', () => {
    renderDetail('sheet', { dimensions: '۱۰۰۰×۲۰۰۰' });
    expect(screen.getByRole('rowheader', { name: 'ابعاد' })).toBeInTheDocument();
    expect(screen.getAllByText('۱۰۰۰×۲۰۰۰').length).toBeGreaterThan(0);
  });

  it('omits the row entirely when a ورق product has none — no «نامشخص» placeholder', () => {
    // Deliberate, and the reason this is its own test: the column is brand new
    // and nothing is backfilled, so almost every sheet SKU is empty today. A
    // spec table showing «ابعاد: نامشخص» on every plate reads as a broken page
    // rather than as an unanswered question.
    renderDetail('sheet');
    expect(screen.queryByRole('rowheader', { name: 'ابعاد' })).not.toBeInTheDocument();
  });

  it('never shows it for a category that has no dimensions to record', () => {
    renderDetail('rebar');
    expect(screen.queryByRole('rowheader', { name: 'ابعاد' })).not.toBeInTheDocument();
  });
});

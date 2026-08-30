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
    order: 0,
    unit: 'kg',
    priceBasis: 'kg',
    isActive: true,
    current: {
      skuId: 'sku-1',
      price: 500_000,
      unit: 'kg',
      priceBasis: 'kg',
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
    renderDetail('rebar', { dimensions: '۹۹' });
    expect(screen.queryByRole('rowheader', { name: 'ابعاد' })).not.toBeInTheDocument();
    expect(screen.queryByText('۹۹')).not.toBeInTheDocument();
  });
});

describe('SkuDetail — نبشی wall thickness', () => {
  it.each(['nabshi', 'angle-unequal', 'spot'])(
    'labels dimensions as ضخامت for %s',
    (subCategoryId) => {
      renderDetail('angle-channel', { subCategoryId, dimensions: '۴' });
      expect(screen.getByRole('rowheader', { name: 'ضخامت' })).toBeInTheDocument();
      expect(screen.queryByRole('rowheader', { name: 'ابعاد' })).not.toBeInTheDocument();
    },
  );

  it.each(['val-post', 'tbar'])(
    'does not expose the shared value on unrelated angle-channel sub %s',
    (subCategoryId) => {
      renderDetail('angle-channel', { subCategoryId, dimensions: '۴' });
      expect(screen.queryByRole('rowheader', { name: 'ضخامت' })).not.toBeInTheDocument();
      expect(screen.queryByText('۴')).not.toBeInTheDocument();
    },
  );
});

describe('SkuDetail — live profile source fields', () => {
  it.each([
    ['prvfyl-snaty', 'حالت'],
    ['profil-mobli', 'حالت'],
    ['profil-galvanizeh', 'طول'],
  ])('shows thickness and the source length label for %s', (subCategoryId, lengthLabel) => {
    renderDetail('profile', {
      subCategoryId,
      size: '۶۰×۶۰',
      dimensions: '۲',
      branchLengthM: 6,
    });
    expect(screen.getByRole('rowheader', { name: 'ضخامت' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: lengthLabel })).toBeInTheDocument();
    expect(screen.queryByRole('rowheader', { name: 'گرید' })).not.toBeInTheDocument();
    // The generic spec row reads the same branch_length_m. Once the source-
    // named attribute owns it, it must not print a second «طول شاخه» row.
    expect(screen.queryByRole('rowheader', { name: 'طول شاخه' })).not.toBeInTheDocument();
  });
});

describe('SkuDetail — hero image alt text (SEO audit: was identical across every SKU in a category)', () => {
  it('marks the shared category stock photo as a sample, not this exact product', () => {
    // No `imageUrl` override → falls back to the category stock photo. Its alt
    // text must say «نمونه» (sample) rather than claim to literally be
    // «کالای آزمایشی», which the shared stock photo demonstrably is not.
    renderDetail('rebar');
    expect(screen.getByRole('img', { name: 'تصویر نمونه کالای آزمایشی' })).toBeInTheDocument();
  });

  it('drops «نمونه» once the admin has uploaded the SKU own real photo', () => {
    renderDetail('rebar', { imageUrl: '/uploads/sku-1.webp' });
    expect(screen.getByRole('img', { name: 'تصویر کالای آزمایشی' })).toBeInTheDocument();
  });
});

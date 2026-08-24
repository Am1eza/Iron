import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PriceRow } from '@/lib/types/domain';
import { SkuDetail } from './SkuDetail';
import { useCartStore } from '@/lib/stores/cart';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

function row(overrides: Partial<PriceRow> = {}): PriceRow {
  return {
    id: 'rebar-14',
    subCategoryId: 'ribbed',
    categoryId: 'rebar',
    slug: 'rebar-14',
    name: 'میلگرد ۱۴',
    size: '۱۴',
    factory: 'فولاد مبارکه',
    unit: 'kg',
    priceBasis: 'kg',
    theoreticalWeightKg: 14.5,
    isActive: true,
    current: {
      skuId: 'rebar-14',
      price: 35_000,
      unit: 'kg',
      priceBasis: 'kg',
      deliveryTime: '۲۴ ساعت',
      vatIncluded: false,
      movementDir: 'flat',
      updatedAt: new Date('2026-08-13T09:00:00Z').toISOString(),
      isStale: false,
    },
    ...overrides,
  } as PriceRow;
}

function renderDetail(overrides: Partial<PriceRow> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SkuDetail row={row(overrides)} related={[]} series={[1, 2]} />
    </QueryClientProvider>,
  );
}

describe('SkuDetail — kg-basis add-to-cart asks how much (US-P0.5)', () => {
  it('opens the quantity step, defaulting to one شاخه\'s weight, instead of adding a bare 1kg', async () => {
    useCartStore.setState({ items: [] });
    const user = userEvent.setup();
    renderDetail();

    await user.click(screen.getAllByRole('button', { name: /افزودن به سبد استعلام/ })[0]!);
    const dialog = await screen.findByRole('dialog', { name: /تعداد/ });
    expect(useCartStore.getState().items).toHaveLength(0);

    await user.click(within(dialog).getByRole('button', { name: 'افزودن به سبد استعلام' }));
    expect(useCartStore.getState().items).toEqual([
      expect.objectContaining({ skuId: 'rebar-14', qty: 14.5 }),
    ]);
  });

  it('lets the visitor type a direct weight for a SKU with no recorded branch weight', async () => {
    useCartStore.setState({ items: [] });
    const user = userEvent.setup();
    renderDetail({ theoreticalWeightKg: undefined });

    await user.click(screen.getAllByRole('button', { name: /افزودن به سبد استعلام/ })[0]!);
    const dialog = await screen.findByRole('dialog', { name: /تعداد/ });

    // No branch weight on record → confirming with nothing typed must not
    // silently add a 0kg (or bare 1kg) line.
    const confirm = within(dialog).getByRole('button', { name: 'افزودن به سبد استعلام' });
    expect(confirm).toBeDisabled();

    await user.type(within(dialog).getByRole('spinbutton'), '500');
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    expect(useCartStore.getState().items).toEqual([
      expect.objectContaining({ skuId: 'rebar-14', qty: 500 }),
    ]);
  });

  it('does not interrupt a non-kg (branch-basis) product', async () => {
    useCartStore.setState({ items: [] });
    const user = userEvent.setup();
    renderDetail({ priceBasis: 'branch', unit: 'branch' });

    await user.click(screen.getAllByRole('button', { name: /افزودن به سبد استعلام/ })[0]!);

    expect(screen.queryByRole('dialog', { name: /تعداد/ })).toBeNull();
    expect(useCartStore.getState().items).toEqual([
      expect.objectContaining({ skuId: 'rebar-14', qty: 1 }),
    ]);
  });
});

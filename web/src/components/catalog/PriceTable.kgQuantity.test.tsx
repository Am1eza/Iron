import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PriceRow } from '@/lib/types/domain';
import type { SubCat } from '@/lib/data/nav';
import { PriceTable } from './PriceTable';
import { useCartStore } from '@/lib/stores/cart';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/prices/rebar',
  useSearchParams: () => new URLSearchParams(),
}));

function row(id: string, priceBasis: PriceRow['priceBasis'], weightKg?: number): PriceRow {
  return {
    id,
    subCategoryId: 'ribbed',
    categoryId: 'rebar',
    slug: id,
    name: id,
    size: '۱۴',
    factory: 'فولاد مبنا',
    priceBasis,
    theoreticalWeightKg: weightKg,
    unit: priceBasis === 'kg' ? 'kg' : 'branch',
    isActive: true,
    current: {
      skuId: id,
      price: 35_000,
      unit: priceBasis === 'kg' ? 'kg' : 'branch',
      priceBasis,
      deliveryTime: '۲۴ ساعت',
      vatIncluded: false,
      movementDir: 'flat',
      updatedAt: new Date('2026-08-13T09:00:00Z').toISOString(),
      isStale: false,
    },
  } as PriceRow;
}

const SUBS: SubCat[] = [{ slug: 'ribbed', name: 'آجدار', groupLabel: null }];

function renderTable(rows: PriceRow[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PriceTable rows={rows} subs={SUBS} categoryName="میلگرد" categorySlug="rebar" />
    </QueryClientProvider>,
  );
}

describe('PriceTable — kg-basis add-to-cart asks how much (US-P0.5)', () => {
  it('opens the quantity step for a kg-basis row instead of adding a bare 1kg', async () => {
    useCartStore.setState({ items: [] });
    const user = userEvent.setup();
    renderTable([row('rebar-14', 'kg', 14.5)]);

    await user.click(screen.getAllByRole('button', { name: /سبد/ })[0]!);
    const dialog = await screen.findByRole('dialog', { name: /تعداد/ });
    expect(dialog).toBeInTheDocument();

    // Cart must stay empty until the visitor actually confirms a quantity.
    expect(useCartStore.getState().items).toHaveLength(0);
  });

  it('defaults the kg quantity step to one branch\'s worth, not 1kg', async () => {
    useCartStore.setState({ items: [] });
    const user = userEvent.setup();
    renderTable([row('rebar-14', 'kg', 14.5)]);

    await user.click(screen.getAllByRole('button', { name: /سبد/ })[0]!);
    const dialog = await screen.findByRole('dialog', { name: /تعداد/ });
    await user.click(within(dialog).getByRole('button', { name: 'افزودن به سبد استعلام' }));

    expect(useCartStore.getState().items).toEqual([
      expect.objectContaining({ skuId: 'rebar-14', qty: 14.5 }),
    ]);
  });

  it('does not interrupt a non-kg (branch-basis) product — qty defaults to 1 unit as before', async () => {
    useCartStore.setState({ items: [] });
    const user = userEvent.setup();
    renderTable([row('valpost-1', 'branch')]);

    await user.click(screen.getAllByRole('button', { name: /سبد/ })[0]!);

    expect(screen.queryByRole('dialog', { name: /تعداد/ })).toBeNull();
    expect(useCartStore.getState().items).toEqual([
      expect.objectContaining({ skuId: 'valpost-1', qty: 1 }),
    ]);
  });
});

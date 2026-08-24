import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Article, PriceRow } from '@/lib/types/domain';
import { SearchBar } from './SearchBar';

afterEach(cleanup);

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

const search = vi.fn();
vi.mock('@/lib/api/resources/catalog', () => ({
  catalogApi: { search: (...args: unknown[]) => search(...args) },
}));

function sku(id: string): PriceRow {
  return {
    id,
    subCategoryId: 'sub-ajdar',
    categoryId: 'rebar',
    slug: id,
    name: 'میلگرد آجدار سایز 14',
    factory: 'فولاد مبارکه',
    size: '14',
    unit: 'kg',
    isActive: true,
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

function article(): Article {
  return {
    id: 'a1',
    slug: 'guide',
    type: 'blog',
    title: 'راهنمای خرید میلگرد',
    status: 'published',
    source: 'human',
  };
}

function renderBar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SearchBar size="lg" />
    </QueryClientProvider>,
  );
}

describe('SearchBar autocomplete', () => {
  it('does not query below the 2-character floor', async () => {
    const user = userEvent.setup();
    renderBar();
    await user.type(screen.getByRole('combobox'), 'م');
    await act(() => new Promise((r) => setTimeout(r, 350)));
    expect(search).not.toHaveBeenCalled();
  });

  it('shows sku and article suggestions from the debounced query', async () => {
    search.mockResolvedValue({ skus: [sku('sku-1')], articles: [article()] });
    const user = userEvent.setup();
    renderBar();
    await user.type(screen.getByRole('combobox'), 'میلگرد 14');

    const listbox = await screen.findByRole('listbox', {}, { timeout: 2000 });
    expect(within(listbox).getByText('میلگرد آجدار سایز 14')).toBeInTheDocument();
    expect(within(listbox).getByText('راهنمای خرید میلگرد')).toBeInTheDocument();
    expect(search).toHaveBeenCalledWith('میلگرد 14', expect.anything());
  });

  it('Enter with a highlighted suggestion navigates there instead of submitting to /search', async () => {
    search.mockResolvedValue({ skus: [sku('sku-1')], articles: [] });
    const user = userEvent.setup();
    renderBar();
    const input = screen.getByRole('combobox');
    await user.type(input, 'میلگرد 14');
    await screen.findByRole('listbox', {}, { timeout: 2000 });

    await user.keyboard('{ArrowDown}{Enter}');
    expect(push).toHaveBeenCalledWith('/prices/rebar/sub-ajdar/sku-1');
    expect(push).not.toHaveBeenCalledWith(expect.stringContaining('/search?'));
  });

  it('Enter with no suggestion highlighted still submits to /search', async () => {
    search.mockResolvedValue({ skus: [], articles: [] });
    const user = userEvent.setup();
    renderBar();
    await user.type(screen.getByRole('combobox'), 'nonsense query{Enter}');
    expect(push).toHaveBeenCalledWith('/search?q=nonsense%20query');
  });
});

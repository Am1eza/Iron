/**
 * SkuDetail — the ❤ button talks to the REAL favorites API.
 *
 * It used to flip a local `useState(false)` and show a success toast: the star
 * never reached /api/me/favorites, never appeared in /account, and was gone on
 * reload. These tests pin the three things that were broken — initial state
 * read from the server, add, and remove.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PriceRow } from '@/lib/types/domain';
import { SkuDetail } from './SkuDetail';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

let authed = true;
vi.mock('@/lib/hooks/useAuth', () => ({ useAuth: () => ({ isAuthenticated: authed, user: null }) }));

const get = vi.fn();
const post = vi.fn();
const del = vi.fn();
vi.mock('@/lib/api/http', () => ({ http: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a), del: (...a: unknown[]) => del(...a) } }));

const ROW: PriceRow = {
  id: 'sku-1',
  subCategoryId: 'black',
  categoryId: 'rebar',
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
};

/** Only the favorites endpoint is meaningful here; anything else the hero's
 *  alert bell asks for resolves empty so it stays out of the way. */
function stubGet(favorites: PriceRow[]) {
  get.mockImplementation((path: string) =>
    path === '/api/me/favorites' ? Promise.resolve({ favorites }) : Promise.resolve({}),
  );
}

function renderDetail() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SkuDetail row={ROW} related={[]} series={[1, 2]} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  authed = true;
  stubGet([]);
  post.mockResolvedValue({ ok: true });
  del.mockResolvedValue({ ok: true });
});

describe('SkuDetail — favorites', () => {
  it('starts unfaved and POSTs the SKU when the heart is pressed', async () => {
    const user = userEvent.setup();
    renderDetail();

    const heart = await screen.findByRole('button', { name: 'افزودن به علاقه‌مندی‌ها' });
    await user.click(heart);

    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/me/favorites', { skuId: 'sku-1' }));
    expect(del).not.toHaveBeenCalled();
  });

  it('renders as already-faved when the server says so, and DELETEs on press', async () => {
    stubGet([ROW]);
    const user = userEvent.setup();
    renderDetail();

    // The whole point of the fix: state comes from the server, not useState(false).
    const heart = await screen.findByRole('button', { name: 'حذف از علاقه‌مندی‌ها' });
    await user.click(heart);

    await waitFor(() => expect(del).toHaveBeenCalledWith('/api/me/favorites/sku-1'));
    expect(post).not.toHaveBeenCalled();
  });

  it('does not fetch or write favorites for a signed-out visitor', async () => {
    authed = false;
    const user = userEvent.setup();
    renderDetail();

    await user.click(screen.getByRole('button', { name: 'افزودن به علاقه‌مندی‌ها' }));

    expect(get).not.toHaveBeenCalledWith('/api/me/favorites');
    expect(post).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });
});

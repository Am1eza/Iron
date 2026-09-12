import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { WarehouseItem } from '@/lib/types/domain';
import { useAuthStore } from '@/lib/stores/auth';
import { WarehouseOperationsPanel } from './WarehouseOperationsPanel';

const get = vi.fn();
const post = vi.fn();
vi.mock('@/lib/api/http', () => ({
  http: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a) },
}));

const ITEMS: WarehouseItem[] = [
  { id: 'wi-1', product: 'میلگرد ۱۴', ref: 'WH-001', status: 'stored' } as WarehouseItem,
];

function renderPanel(props: Partial<{ items: WarehouseItem[]; staff: boolean }> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <WarehouseOperationsPanel items={props.items ?? ITEMS} staff={props.staff} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ user: null, status: 'anonymous' });
  get.mockResolvedValue({ withdrawals: [], cash: [], hasMore: false });
  post.mockResolvedValue({ ok: true });
});

describe('WarehouseOperationsPanel — customer view (staff=false)', () => {
  it('shows the withdrawal-request form and calls the customer endpoint', async () => {
    renderPanel({ staff: false });
    expect(await screen.findByRole('group', { name: 'درخواست برداشت از موجودی خودتان' })).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('/api/me/warehouse/operations?page=1');
    // The manager-only cash-entry form must never render for a customer.
    expect(screen.queryByRole('group', { name: 'ثبت سند فروش یا واریز انجام‌شده' })).not.toBeInTheDocument();
  });

  it('submits a withdrawal request with the typed quantity and recipient', async () => {
    const user = userEvent.setup();
    renderPanel({ staff: false });
    await screen.findByRole('group', { name: 'درخواست برداشت از موجودی خودتان' });

    await user.selectOptions(screen.getByLabelText(/کالا/), 'wi-1');
    await user.type(screen.getByLabelText(/مقدار به تن/), '2');
    await user.type(screen.getByLabelText(/نام گیرنده و مشخصات تحویل/), 'علی رضایی');
    await user.click(screen.getByRole('button', { name: 'ثبت درخواست برداشت' }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        '/api/me/warehouse/operations',
        expect.objectContaining({
          action: 'request',
          warehouseItemId: 'wi-1',
          quantityTons: 2,
          recipient: 'علی رضایی',
        }),
      ),
    );
  });

  it('renders a withdrawal row with its translated status label', async () => {
    get.mockResolvedValue({
      withdrawals: [{ id: 'w1', warehouseItemId: 'wi-1', quantityTons: 3, recipient: 'سارا احمدی', status: 'requested' }],
      cash: [],
      hasMore: false,
    });
    renderPanel({ staff: false });
    expect(await screen.findByText(/میلگرد ۱۴.*3.*سارا احمدی.*در انتظار تأیید/)).toBeInTheDocument();
  });
});

describe('WarehouseOperationsPanel — staff view (staff=true)', () => {
  it('hides the customer request form and the manager cash-entry form for a non-manager staff role', async () => {
    useAuthStore.setState({ user: { id: 'u1', mobile: '0912', role: 'sales' }, status: 'authenticated' });
    renderPanel({ staff: true });
    await waitFor(() => expect(get).toHaveBeenCalledWith('/api/admin/operations?page=1'));
    expect(screen.queryByRole('group', { name: 'درخواست برداشت از موجودی خودتان' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'ثبت سند فروش یا واریز انجام‌شده' })).not.toBeInTheDocument();
  });

  it('shows the cash-entry form for a manager (leads:manage) role', async () => {
    useAuthStore.setState({ user: { id: 'u1', mobile: '0912', role: 'admin' }, status: 'authenticated' });
    renderPanel({ staff: true });
    expect(await screen.findByRole('group', { name: 'ثبت سند فروش یا واریز انجام‌شده' })).toBeInTheDocument();
  });

  it('shows the approve/reserve action for a requested withdrawal', async () => {
    useAuthStore.setState({ user: { id: 'u1', mobile: '0912', role: 'admin' }, status: 'authenticated' });
    get.mockResolvedValue({
      withdrawals: [{ id: 'w1', warehouseItemId: 'wi-1', quantityTons: 1, recipient: 'رضا محمدی', status: 'requested' }],
      cash: [],
      hasMore: false,
    });
    renderPanel({ staff: true });
    expect(await screen.findByRole('button', { name: 'تأیید و رزرو' })).toBeInTheDocument();
  });
});

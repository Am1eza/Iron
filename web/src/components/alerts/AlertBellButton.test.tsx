import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/lib/stores/auth';
import { useUiStore } from '@/lib/stores/ui';
import { alertsApi } from '@/lib/api/resources/misc';
import type * as Misc from '@/lib/api/resources/misc';
import type { Alert } from '@/lib/types/domain';
import { AlertBellButton, type AlertBellTarget } from './AlertBellButton';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/prices/rebar/deformed',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/api/resources/misc', async (importOriginal) => {
  const actual = await importOriginal<typeof Misc>();
  return {
    ...actual,
    alertsApi: {
      ...actual.alertsApi,
      list: vi.fn(),
      create: vi.fn(),
      remove: vi.fn(),
    },
  };
});

const TARGET: AlertBellTarget = {
  type: 'sku',
  skuId: 'r1',
  label: 'میلگرد ۱۴',
  currentValue: 100_000,
};

function renderBell(alerts: Alert[] = []) {
  vi.mocked(alertsApi.list).mockResolvedValue({ alerts });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AlertBellButton target={TARGET} />
    </QueryClientProvider>,
  );
}

const ACTIVE_ALERT: Alert = {
  id: 'a1',
  target: { type: 'sku', skuId: 'r1' },
  op: 'above',
  threshold: 123_000,
  channel: 'sms',
  status: 'active',
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z',
};

beforeEach(() => {
  useAuthStore.setState({ user: null, status: 'anonymous' });
  useUiStore.setState({ toasts: [] });
  vi.mocked(alertsApi.create).mockReset();
  vi.mocked(alertsApi.remove).mockReset();
});

describe('AlertBellButton — perf: the form/mutation machinery is not mounted until opened', () => {
  it('renders only the trigger button, no dialog, before any click', () => {
    useAuthStore.setState({
      user: { id: 'u1', mobile: '0912', role: 'customer' },
      status: 'authenticated',
    });
    renderBell();
    expect(screen.getByRole('button', { name: 'ثبت هشدار قیمت' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('mounts the modal, with the form, only after the bell is clicked', async () => {
    useAuthStore.setState({
      user: { id: 'u1', mobile: '0912', role: 'customer' },
      status: 'authenticated',
    });
    renderBell();
    await userEvent.click(screen.getByRole('button', { name: 'ثبت هشدار قیمت' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText(/آستانهٔ هشدار/)).toBeInTheDocument();
  });
});

describe('AlertBellButton — login gate', () => {
  it('does not open the modal for an unauthenticated visitor; shows a toast instead', async () => {
    renderBell();
    await userEvent.click(screen.getByRole('button', { name: 'ثبت هشدار قیمت' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        useUiStore.getState().toasts.some((t) => t.message === 'برای ثبت هشدار قیمت وارد شوید.'),
      ).toBe(true),
    );
  });
});

describe('AlertBellButton — form pre-fill (W22 regression: must not silently create a duplicate alert)', () => {
  it('defaults a NEW alert to 5% below the current price', async () => {
    useAuthStore.setState({
      user: { id: 'u1', mobile: '0912', role: 'customer' },
      status: 'authenticated',
    });
    renderBell([]);
    await userEvent.click(screen.getByRole('button', { name: 'ثبت هشدار قیمت' }));
    const input = await screen.findByLabelText(/آستانهٔ هشدار/);
    expect(input).toHaveValue('95000');
    expect(screen.getByRole('radio', { name: 'وقتی قیمت کمتر شود' })).toBeChecked();
  });

  it('pre-fills an EXISTING active alert with its own stored op/threshold, not a fresh suggestion', async () => {
    useAuthStore.setState({
      user: { id: 'u1', mobile: '0912', role: 'customer' },
      status: 'authenticated',
    });
    renderBell([ACTIVE_ALERT]);
    await userEvent.click(await screen.findByRole('button', { name: 'هشدار قیمت فعال؛ مدیریت' }));
    const input = await screen.findByLabelText(/آستانهٔ هشدار/);
    expect(input).toHaveValue(String(ACTIVE_ALERT.threshold));
    expect(screen.getByRole('radio', { name: 'وقتی قیمت بیشتر شود' })).toBeChecked();
    expect(screen.getByRole('heading', { name: 'مدیریت هشدار قیمت' })).toBeInTheDocument();
  });
});

describe('AlertBellButton — submit/delete still work end to end', () => {
  it('submits the form and closes the modal on success', async () => {
    useAuthStore.setState({
      user: { id: 'u1', mobile: '0912', role: 'customer' },
      status: 'authenticated',
    });
    vi.mocked(alertsApi.create).mockResolvedValue({ ok: true, alert: ACTIVE_ALERT, merged: false });
    renderBell([]);
    await userEvent.click(screen.getByRole('button', { name: 'ثبت هشدار قیمت' }));
    await screen.findByRole('dialog');
    await userEvent.click(screen.getByRole('button', { name: 'ثبت هشدار' }));
    await waitFor(() => expect(alertsApi.create).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('deletes an existing alert and closes the modal on success', async () => {
    useAuthStore.setState({
      user: { id: 'u1', mobile: '0912', role: 'customer' },
      status: 'authenticated',
    });
    vi.mocked(alertsApi.remove).mockResolvedValue({ ok: true });
    renderBell([ACTIVE_ALERT]);
    await userEvent.click(await screen.findByRole('button', { name: 'هشدار قیمت فعال؛ مدیریت' }));
    await screen.findByRole('dialog');
    await userEvent.click(screen.getByRole('button', { name: 'حذف این هشدار' }));
    await waitFor(() => expect(alertsApi.remove).toHaveBeenCalledWith(ACTIVE_ALERT.id));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

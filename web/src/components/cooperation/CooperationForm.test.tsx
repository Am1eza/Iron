import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useUiStore } from '@/lib/stores/ui';
import { cooperationApi } from '@/lib/api/resources/misc';
import { ApiError } from '@/lib/api/errors';
import type * as Misc from '@/lib/api/resources/misc';
import { CooperationForm } from './CooperationForm';

vi.mock('@/lib/api/resources/misc', async (importOriginal) => {
  const actual = await importOriginal<typeof Misc>();
  return { ...actual, cooperationApi: { ...actual.cooperationApi, submit: vi.fn() } };
});

beforeEach(() => {
  useUiStore.setState({ toasts: [] });
  vi.mocked(cooperationApi.submit).mockReset();
});

async function fillAndSubmit() {
  await userEvent.type(screen.getByLabelText(/نام و نام خانوادگی/), 'شرکت آهن گستر');
  await userEvent.type(screen.getByLabelText(/شمارهٔ موبایل/), '09121234567');
  await userEvent.click(screen.getByRole('button', { name: 'ثبت درخواست همکاری' }));
}

describe('CooperationForm — W-186 regression: submissions must reach the backend, not just show a success toast', () => {
  it('POSTs the track, company and mobile to /api/cooperation on a valid submit', async () => {
    vi.mocked(cooperationApi.submit).mockResolvedValue({ ok: true });
    render(<CooperationForm track="analysis" />);
    await fillAndSubmit();
    await waitFor(() =>
      expect(cooperationApi.submit).toHaveBeenCalledWith(
        expect.objectContaining({ track: 'analysis', company: 'شرکت آهن گستر', mobile: '09121234567' }),
      ),
    );
  });

  it('shows the success toast and resets the form only after the API call resolves', async () => {
    vi.mocked(cooperationApi.submit).mockResolvedValue({ ok: true });
    render(<CooperationForm track="supply" />);
    await fillAndSubmit();
    await waitFor(() =>
      expect(useUiStore.getState().toasts.some((t) => t.message === 'درخواست شما ثبت شد؛ به‌زودی تماس می‌گیریم.')).toBe(
        true,
      ),
    );
    expect(screen.getByLabelText(/نام و نام خانوادگی/)).toHaveValue('');
  });

  it('shows an error toast and keeps the form filled in when the API call fails', async () => {
    vi.mocked(cooperationApi.submit).mockRejectedValue(
      new ApiError(500, 'ثبت درخواست ناموفق بود. دوباره تلاش کنید.'),
    );
    render(<CooperationForm track="sell" />);
    await fillAndSubmit();
    await waitFor(() =>
      expect(
        useUiStore.getState().toasts.some((t) => t.message === 'ثبت درخواست ناموفق بود. دوباره تلاش کنید.'),
      ).toBe(true),
    );
    expect(screen.getByLabelText(/نام و نام خانوادگی/)).toHaveValue('شرکت آهن گستر');
  });
});

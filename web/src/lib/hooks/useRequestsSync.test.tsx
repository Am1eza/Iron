import { StrictMode, type ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/lib/stores/auth';
import { useRequestsStore, type UserRequest } from '@/lib/stores/requests';
import { http } from '@/lib/api/http';
import { useRequestsSync } from './useRequestsSync';

vi.mock('@/lib/api/config', () => ({ API_MODE: 'live' }));
vi.mock('@/lib/api/http', () => ({ http: { get: vi.fn(), post: vi.fn() } }));
const user = { id: 'user-a', mobile: '09120000000', role: 'customer' as const };
const row: UserRequest = {
  id: 'local',
  ref: 'RQ-local',
  type: 'bulk',
  title: 'Local',
  status: 'submitted',
  createdAt: '2026-01-01',
};

beforeEach(async () => {
  vi.clearAllMocks();
  useRequestsStore.getState().clear();
  await useRequestsStore.persist.rehydrate();
  useAuthStore.getState().setUser(user);
  vi.mocked(http.get).mockResolvedValue({ requests: [] });
  vi.mocked(http.post).mockResolvedValue({ ok: true, imported: 0, skipped: [] });
});

describe('useRequestsSync', () => {
  it('completes syncing after Strict Mode setup/cleanup replay', async () => {
    useRequestsStore.getState().replaceAll([row]);
    renderHook(() => useRequestsSync(), {
      wrapper: ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>,
    });
    await waitFor(() => expect(http.get).toHaveBeenCalledTimes(1));
    expect(http.post).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(useRequestsStore.getState().requests).toEqual([]));
  });

  it('does not restart when the same user object is refreshed', async () => {
    renderHook(() => useRequestsSync());
    await waitFor(() => expect(http.get).toHaveBeenCalledTimes(1));
    act(() => useAuthStore.getState().setUser({ ...user, name: 'Updated' }));
    expect(http.get).toHaveBeenCalledTimes(1);
  });

  it('aborts a previous account fetch and ignores its late result', async () => {
    let resolveOld!: (value: { requests: UserRequest[] }) => void;
    vi.mocked(http.get).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    );
    renderHook(() => useRequestsSync());
    await waitFor(() => expect(http.get).toHaveBeenCalledTimes(1));
    const oldSignal = vi.mocked(http.get).mock.calls[0]![1]!.signal!;
    act(() => useAuthStore.getState().setUser({ ...user, id: 'user-b' }));
    await waitFor(() => expect(http.get).toHaveBeenCalledTimes(2));
    expect(oldSignal.aborted).toBe(true);
    await act(async () => resolveOld({ requests: [row] }));
    expect(useRequestsStore.getState().requests).toEqual([]);
  });

  it('keeps local requests the server could not import', async () => {
    useRequestsStore.getState().replaceAll([row]);
    vi.mocked(http.post).mockResolvedValue({ ok: true, imported: 0, skipped: [row.ref] });
    renderHook(() => useRequestsSync());
    await waitFor(() => expect(http.get).toHaveBeenCalledTimes(1));
    expect(useRequestsStore.getState().requests).toEqual([row]);
  });

  it('syncs again when the same user signs out and back in', async () => {
    renderHook(() => useRequestsSync());
    await waitFor(() => expect(http.get).toHaveBeenCalledTimes(1));
    act(() => useAuthStore.getState().setUser(null));
    act(() => useAuthStore.getState().setUser(user));
    await waitFor(() => expect(http.get).toHaveBeenCalledTimes(2));
  });
});

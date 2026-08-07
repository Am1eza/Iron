import { describe, it, expect, vi, beforeEach } from 'vitest';

const refreshMock = vi.fn();
vi.mock('@/lib/api/resources/auth', () => ({
  authApi: { refresh: (...args: unknown[]) => refreshMock(...args) },
}));

import { useAuthStore } from '@/lib/stores/auth';
import { recoverSession } from './clientRefresh';

describe('recoverSession', () => {
  beforeEach(() => {
    refreshMock.mockReset();
    useAuthStore.getState().setUser(null);
  });

  it('resolves true and updates the store on a successful refresh', async () => {
    const user = { id: '1', mobile: '09120000000', role: 'sales' } as never;
    refreshMock.mockResolvedValue({ user });

    const ok = await recoverSession();

    expect(ok).toBe(true);
    expect(useAuthStore.getState().user).toEqual(user);
  });

  it('resolves false and clears the store when the refresh fails', async () => {
    refreshMock.mockRejectedValue(new Error('no_session'));

    const ok = await recoverSession();

    expect(ok).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('dedupes concurrent callers into a single underlying refresh call', async () => {
    let resolveRefresh!: (v: { user: unknown }) => void;
    refreshMock.mockReturnValue(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      }),
    );

    const first = recoverSession();
    const second = recoverSession();
    resolveRefresh({ user: { id: '1', mobile: '09120000000', role: 'sales' } });
    const [a, b] = await Promise.all([first, second]);

    expect(a).toBe(true);
    expect(b).toBe(true);
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it('starts a fresh refresh call after a prior one has settled', async () => {
    refreshMock.mockResolvedValueOnce({ user: { id: '1', mobile: '09120000000', role: 'sales' } });
    await recoverSession();

    refreshMock.mockResolvedValueOnce({ user: { id: '1', mobile: '09120000000', role: 'sales' } });
    await recoverSession();

    expect(refreshMock).toHaveBeenCalledTimes(2);
  });
});

'use client';
import { useEffect } from 'react';
import { API_MODE } from '@/lib/api/config';
import { http } from '@/lib/api/http';
import { useAuthStore } from '@/lib/stores/auth';
import { useRequestsStore, type UserRequest } from '@/lib/stores/requests';

/** Import the local inbox once per authenticated user, then mirror the server.
 * Cancel obsolete work on logout, account changes, and Strict Mode cleanup. */
export function useRequestsSync(): void {
  const userId = useAuthStore((s) => s.user?.id);

  useEffect(() => {
    if (API_MODE !== 'live' || !userId) return;
    const controller = new AbortController();
    const { signal } = controller;

    void (async () => {
      try {
        // StoreHydrator may not have run yet. Awaiting also lets a Strict Mode
        // cleanup cancel the first setup before it starts an import.
        await useRequestsStore.persist.rehydrate();
        signal.throwIfAborted();
        const local = useRequestsStore.getState().requests;
        let skipped: string[] = [];
        if (local.length > 0) {
          const res = await http.post<{ ok: true; imported: number; skipped: string[] }>(
            '/api/me/requests/import',
            { requests: local },
            { signal },
          );
          skipped = res.skipped;
        }
        signal.throwIfAborted();
        const { requests } = await http.get<{ requests: UserRequest[] }>('/api/me/requests', {
          signal,
        });
        signal.throwIfAborted();
        // Preserve conflicts, but let replaceAll deduplicate rows now on the server.
        const skippedRefs = new Set(skipped);
        const stillLocal = local.filter((r) => skippedRefs.has(r.ref));
        useRequestsStore.getState().replaceAll(requests, stillLocal);
      } catch {
        // Keep the local inbox on failure. A later mount/sign-in retries.
      }
    })();

    return () => controller.abort();
  }, [userId]);
}

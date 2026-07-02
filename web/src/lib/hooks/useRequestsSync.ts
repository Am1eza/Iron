'use client';
/**
 * Live-mode sync for the requests inbox: pushes any locally-filed requests to
 * the server (idempotent by ref) and mirrors the server's list back into the
 * zustand store, so RequestsList/ProfileStats keep working unchanged and
 * legacy localStorage inboxes migrate on first authenticated visit.
 */
import { useEffect, useRef } from 'react';
import { API_MODE } from '@/lib/api/config';
import { http } from '@/lib/api/http';
import { useAuthStore } from '@/lib/stores/auth';
import { useRequestsStore, type UserRequest } from '@/lib/stores/requests';

export function useRequestsSync(): void {
  const user = useAuthStore((s) => s.user);
  const syncedFor = useRef<string | null>(null);

  useEffect(() => {
    if (API_MODE !== 'live' || !user || syncedFor.current === user.id) return;
    syncedFor.current = user.id;
    let cancelled = false;

    (async () => {
      try {
        const local = useRequestsStore.getState().requests;
        if (local.length > 0) {
          await http.post('/api/me/requests/import', { requests: local });
        }
        const { requests } = await http.get<{ requests: UserRequest[] }>('/api/me/requests');
        if (!cancelled) useRequestsStore.getState().replaceAll(requests);
      } catch {
        // Non-fatal: the local mirror keeps serving; next visit retries.
        syncedFor.current = null;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);
}

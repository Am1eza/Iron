'use client';
/**
 * Live-mode sync for the requests inbox: pushes any locally-filed requests to
 * the server (idempotent by (userId, ref)) and mirrors the server's list back
 * into the zustand store, so RequestsList/ProfileStats keep working unchanged
 * and legacy localStorage inboxes migrate on first authenticated visit.
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
        let skipped: string[] = [];
        if (local.length > 0) {
          const res = await http.post<{ ok: true; imported: number; skipped: string[] }>('/api/me/requests/import', { requests: local });
          skipped = res.skipped;
        }
        const { requests } = await http.get<{ requests: UserRequest[] }>('/api/me/requests');
        if (cancelled) return;
        // W20: `replaceAll` used to wholesale-overwrite the local mirror with
        // the server's list, so any row the import route reported as
        // `skipped` (a genuine conflict, not a success) was discarded from
        // BOTH places — silently gone. Local rows the import couldn't place
        // are kept so a later sync attempt (or a human looking at raw
        // localStorage) can still recover them instead of losing the request.
        const stillLocal = local.filter((r) => skipped.includes(r.ref));
        useRequestsStore.getState().replaceAll(requests, stillLocal);
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

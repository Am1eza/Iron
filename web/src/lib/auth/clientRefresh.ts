import { authApi } from '@/lib/api/resources/auth';
import { useAuthStore } from '@/lib/stores/auth';

let inFlight: Promise<boolean> | null = null;

/**
 * Deduplicated session refresh — the one thing every 401-recovery caller
 * (the `setUnauthorizedHook` retry in `lib/api/http.ts`, AuthHydrator's own
 * proactive rotation timer) must share. The refresh token is single-use
 * (`rotateRefresh`); two concurrent `POST /api/auth/refresh` calls would
 * have the second reuse an already-rotated token and trip reuse-detection,
 * revoking the whole session instead of saving it. A burst of requests that
 * all 401 around the same moment therefore awaits this ONE attempt instead
 * of each starting its own.
 */
export function recoverSession(): Promise<boolean> {
  if (!inFlight) {
    inFlight = authApi
      .refresh()
      .then(({ user }) => {
        useAuthStore.getState().setUser(user);
        return true;
      })
      .catch(() => {
        useAuthStore.getState().setUser(null);
        return false;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

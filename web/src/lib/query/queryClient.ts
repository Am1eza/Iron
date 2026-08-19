import {
  QueryClient,
  QueryCache,
  MutationCache,
  defaultShouldDehydrateQuery,
  isServer,
} from '@tanstack/react-query';
/**
 * `reportError` is loaded on demand, NOT statically imported.
 *
 * This module is constructed by `AppProviders` in the root layout, so anything
 * it imports lands in `app/layout-<hash>.js` — the chunk on the critical path
 * of every single page, and the one that actually failed to download in the
 * weak-connection incident behind PRs #193/#194. A static import put
 * `lib/errors/report` and its `lib/errors/scrub` PII redactor there for the
 * benefit of two handlers that, on a healthy page load, never run at all.
 *
 * Deferring costs nothing in the ordinary case (zero extra requests — the
 * chunk is fetched only once a query or mutation has actually failed) and
 * nothing meaningful in the failure case either: the client half of
 * `reportError` is a `sendBeacon` to `/api/log`, so a network bad enough to
 * block this import was already going to block the report itself.
 */
function report(error: unknown, context: Record<string, unknown>): void {
  void import('@/lib/errors/report')
    .then((m) => m.reportError(error, context))
    // A failed reporter must never become a second, louder error.
    .catch(() => {});
}

function makeQueryClient(): QueryClient {
  return new QueryClient({
    // Centralized logging — UI is handled locally (no global toast → no double-notify).
    queryCache: new QueryCache({
      onError: (error, query) => report(error, { source: 'query', key: query.queryKey }),
    }),
    mutationCache: new MutationCache({
      onError: (error) => report(error, { source: 'mutation' }),
    }),
    defaultOptions: {
      queries: {
        staleTime: 60_000, // 1 min
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        // No retry on client (4xx) errors; limited retry on server (5xx).
        retry: (failureCount, error) => {
          const status = (error as { status?: number } | null)?.status;
          if (status && status >= 400 && status < 500) return false;
          return failureCount < 2;
        },
      },
      dehydrate: {
        // Include pending queries so streamed/prefetched data hydrates cleanly.
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) || query.state.status === 'pending',
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

/** One client per request on the server; a singleton in the browser. */
export function getQueryClient(): QueryClient {
  if (isServer) return makeQueryClient();
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}

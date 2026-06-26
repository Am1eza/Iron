import {
  QueryClient,
  QueryCache,
  MutationCache,
  defaultShouldDehydrateQuery,
  isServer,
} from '@tanstack/react-query';
import { reportError } from '@/lib/errors/report';

function makeQueryClient(): QueryClient {
  return new QueryClient({
    // Centralized logging — UI is handled locally (no global toast → no double-notify).
    queryCache: new QueryCache({
      onError: (error, query) => reportError(error, { source: 'query', key: query.queryKey }),
    }),
    mutationCache: new MutationCache({
      onError: (error) => reportError(error, { source: 'mutation' }),
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

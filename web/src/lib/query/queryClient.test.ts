import { describe, it, expect, vi, beforeEach } from 'vitest';

const reportError = vi.fn();
vi.mock('@/lib/errors/report', () => ({ reportError }));

import { getQueryClient } from './queryClient';

/**
 * `reportError` is now loaded with a dynamic `import()` instead of a static one,
 * to keep `lib/errors/report` (+ its `scrub` PII redactor) out of
 * `app/layout-<hash>.js`. That only pays off if the reporting itself still
 * happens — a silently-dropped error report is far worse than the bytes it
 * saved, so this asserts the deferred path actually fires for both caches.
 */
describe('queryClient error reporting', () => {
  beforeEach(() => reportError.mockClear());

  it('reports a failed query, with the query key as context', async () => {
    const client = getQueryClient();
    const boom = new Error('query blew up');
    await client
      .fetchQuery({ queryKey: ['boom-query'], queryFn: () => Promise.reject(boom), retry: false })
      .catch(() => {});
    // The import() resolves a microtask later than the synchronous onError.
    await vi.waitFor(() => expect(reportError).toHaveBeenCalled());
    expect(reportError).toHaveBeenCalledWith(boom, { source: 'query', key: ['boom-query'] });
  });

  it('reports a failed mutation', async () => {
    const client = getQueryClient();
    const boom = new Error('mutation blew up');
    const observerless = client.getMutationCache().build(client, {
      mutationFn: () => Promise.reject(boom),
      retry: false,
    });
    await observerless.execute(undefined).catch(() => {});
    await vi.waitFor(() => expect(reportError).toHaveBeenCalled());
    expect(reportError).toHaveBeenCalledWith(boom, { source: 'mutation' });
  });
});

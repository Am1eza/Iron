// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MarketBoard } from './MarketBoard';

// Force the live-mode branch: MarketBoard falls back to mock fixtures when
// API_MODE === 'mock' (the test-suite default), which would mask the very
// bug this file regression-tests — a pending query never even reaches the
// "no values yet" branch if fixtures fill it in immediately.
vi.mock('@/lib/api/config', () => ({ API_MODE: 'live' }));

function renderBoard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MarketBoard />
    </QueryClientProvider>,
  );
}

describe('MarketBoard — loading vs. empty (audit finding: was blank while loading)', () => {
  it('shows a shape-matched skeleton while the first poll is still in flight, not a blank board', async () => {
    vi.doMock('@/lib/api/resources/market', () => ({
      marketApi: { list: () => new Promise(() => {}) }, // never resolves — stays "loading"
    }));
    const { container } = renderBoard();

    // Not the error empty-state (that's the OTHER branch of the same `if`).
    expect(screen.queryByText('مشکلی پیش آمد')).toBeNull();
    // A real placeholder card grid, not nothing.
    expect(container.querySelectorAll('[aria-hidden="true"] li').length).toBeGreaterThan(0);

    vi.doUnmock('@/lib/api/resources/market');
  });

  it('shows the server-error empty state once the poll resolves with no values', async () => {
    vi.doMock('@/lib/api/resources/market', () => ({
      marketApi: { list: async () => ({ values: [] }) },
    }));
    renderBoard();

    expect(await screen.findByText('مشکلی پیش آمد')).toBeInTheDocument();

    vi.doUnmock('@/lib/api/resources/market');
  });
});

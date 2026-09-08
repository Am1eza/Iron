/**
 * Ticker — the initial server-fetched values (SEO audit: the ticker used to
 * render a literal all-zero placeholder in the server HTML for every page
 * until the client's own poll landed a moment later, both flashing wrong
 * numbers at real visitors and showing false financial data to anything that
 * reads raw HTML without running JS).
 */
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithIntl as render } from '@/test/renderWithIntl';
import type { MarketValue } from '@/lib/types/domain';
import { Ticker } from './Ticker';

vi.mock('@/lib/hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));

let marketData: { values: MarketValue[] } | undefined;
vi.mock('@/lib/hooks/useMarket', () => ({ useMarket: () => ({ data: marketData }) }));

function usd(value: number): MarketValue {
  return {
    key: 'usd',
    label: 'دلار',
    value,
    unit: 'تومان',
    source: 'tgju',
    movementDir: 'flat',
    movementPct: 0,
    updatedAt: '',
    isStale: false,
  };
}

describe('Ticker — value precedence before the client poll lands', () => {
  it('shows the server-fetched initialValues, not the all-zero placeholder', () => {
    marketData = undefined;
    render(<Ticker initialValues={[usd(71_750)]} />);
    expect(screen.getAllByText('۷۱٬۷۵۰').length).toBeGreaterThan(0);
    expect(screen.queryByText('۰')).not.toBeInTheDocument();
  });

  it('falls back to honest em-dash placeholders when no initialValues were passed', () => {
    // The DB-down case in layout.tsx (`hasDb()` false, or the fetch rejected).
    // Must not crash, and must not fabricate a plausible-looking number.
    marketData = undefined;
    render(<Ticker />);
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.queryByText('۰')).not.toBeInTheDocument();
  });

  it('prefers the live polled value over the stale initialValues once it lands', () => {
    marketData = { values: [usd(72_100)] };
    render(<Ticker initialValues={[usd(71_750)]} />);
    expect(screen.getAllByText('۷۲٬۱۰۰').length).toBeGreaterThan(0);
    expect(screen.queryByText('۷۱٬۷۵۰')).not.toBeInTheDocument();
  });
});

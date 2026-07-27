/** A rate's change must never be reported as a percent of a percent. */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KpiCard } from './KpiCard';

describe('KpiCard delta semantics', () => {
  it('renders a count change as a percent', () => {
    render(<KpiCard label="سرنخ" value={120} delta={{ value: 12.5, kind: 'pct' }} />);
    expect(screen.getByText(/▲ ۱۲\.۵٪/)).toBeInTheDocument();
  });

  it('renders a RATE change in percentage points, not percent', () => {
    // 12% → 15% is +3 points; showing "+۲۵٪" here would be the classic lie.
    render(<KpiCard label="نرخ تبدیل" value={15} unit="٪" delta={{ value: 3, kind: 'pts' }} />);
    expect(screen.getByText(/▲ ۳ واحد/)).toBeInTheDocument();
  });

  it('renders «جدید» when the prior window was empty instead of an infinite percent', () => {
    render(<KpiCard label="سفارش" value={4} delta={{ value: null, kind: 'pct' }} />);
    expect(screen.getByText('جدید')).toBeInTheDocument();
  });

  it('keeps the unit out of the headline number element', () => {
    render(<KpiCard label="ارزش" value={1000} unit="تومان" />);
    expect(screen.getByText('تومان')).not.toBe(screen.getByText(/^۱,۰۰۰$/));
  });
});

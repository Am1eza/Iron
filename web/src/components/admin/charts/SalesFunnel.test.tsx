/** The funnel's step math is the number managers act on — pin it down. */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SalesFunnel } from './SalesFunnel';

describe('SalesFunnel', () => {
  const stages = [
    { label: 'گفتگو', value: 200 },
    { label: 'سرنخ', value: 50 },
    { label: 'پیش‌فاکتور', value: 10, benchmark: 25 },
  ];

  it('shows each stage conversion RELATIVE TO THE STAGE ABOVE, not to the top', () => {
    render(<SalesFunnel stages={stages} />);
    // 50/200 = 25%, then 10/50 = 20% — never 10/200 = 5%.
    expect(screen.getByText(/۲۵٪/)).toBeInTheDocument();
    expect(screen.getByText(/۲۰٪/)).toBeInTheDocument();
  });

  it('flags a stage that converts under its benchmark as a leak', () => {
    render(<SalesFunnel stages={stages} />);
    expect(screen.getByText('نشتی')).toBeInTheDocument();
  });

  it('does not flag a stage that meets its benchmark', () => {
    render(<SalesFunnel stages={[{ label: 'سرنخ', value: 50 }, { label: 'پیش‌فاکتور', value: 20, benchmark: 25 }]} />);
    expect(screen.queryByText('نشتی')).not.toBeInTheDocument();
  });

  it('renders the first stage without a conversion row (nothing above it)', () => {
    render(<SalesFunnel stages={[{ label: 'سرنخ', value: 7 }]} />);
    expect(screen.queryByText(/٪/)).not.toBeInTheDocument();
  });

  it('survives a zero-value parent without dividing by zero', () => {
    render(<SalesFunnel stages={[{ label: 'الف', value: 0 }, { label: 'ب', value: 0 }]} />);
    expect(screen.queryByText(/NaN|Infinity/)).not.toBeInTheDocument();
  });
});

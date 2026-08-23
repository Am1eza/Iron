import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BUSINESS_ACCOUNT_LABEL } from '@/lib/data/verification';
import { BusinessAccountBadge } from './BusinessAccountBadge';

describe('BusinessAccountBadge', () => {
  it('shows the company name alongside the label when there is one', () => {
    render(<BusinessAccountBadge companyName="فولاد نمونه" />);
    expect(screen.getByText(`${BUSINESS_ACCOUNT_LABEL} · فولاد نمونه`)).toBeInTheDocument();
  });

  it('falls back to the bare label when the name is missing or blank', () => {
    const { rerender } = render(<BusinessAccountBadge />);
    expect(screen.getByText(BUSINESS_ACCOUNT_LABEL)).toBeInTheDocument();
    rerender(<BusinessAccountBadge companyName="   " />);
    expect(screen.getByText(BUSINESS_ACCOUNT_LABEL)).toBeInTheDocument();
  });
});

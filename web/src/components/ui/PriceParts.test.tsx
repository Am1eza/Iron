import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MovementBadge, PriceTag, DeliveryBadge } from './PriceParts';

describe('MovementBadge', () => {
  it('renders an up arrow + signed percent for a gain', () => {
    render(<MovementBadge dir="up" pct={0.8} />);
    expect(screen.getByText(/\+۰\.۸۰٪/)).toBeInTheDocument();
    expect(screen.getByText('▲')).toBeInTheDocument();
  });

  it('announces the direction for screen readers', () => {
    render(<MovementBadge dir="down" pct={-0.3} />);
    expect(screen.getByText(/کاهش/)).toBeInTheDocument();
  });
});

describe('PriceTag', () => {
  it('renders grouped Persian digits with the Toman unit', () => {
    render(<PriceTag value={32450} />);
    expect(screen.getByText('۳۲٬۴۵۰')).toBeInTheDocument();
    expect(screen.getByText('تومان')).toBeInTheDocument();
  });
});

describe('DeliveryBadge', () => {
  it('shows the delivery time value', () => {
    render(<DeliveryBadge value="۲۴ ساعت" />);
    expect(screen.getByText('۲۴ ساعت')).toBeInTheDocument();
  });
});

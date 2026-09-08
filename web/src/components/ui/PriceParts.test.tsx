import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MovementBadge, PriceTag, DeliveryBadge, BestPriceBadge } from './PriceParts';

// See `@/test/intlMock` — resolves real Persian text from `messages/fa.json`
// so this file's assertions stay byte-identical to what the app renders.
vi.mock('next-intl', async () => {
  const { mockUseLocale, mockUseTranslations } = await import('@/test/intlMock');
  return { useLocale: mockUseLocale, useTranslations: mockUseTranslations };
});

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

  it('shows the بدون تغییر label visibly (not just to screen readers) when there is no pct to compute', () => {
    render(<MovementBadge dir="flat" pill />);
    const label = screen.getByText(/بدون تغییر/);
    expect(label).toBeInTheDocument();
    expect(label.className).not.toMatch(/visually-hidden/);
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

describe('BestPriceBadge', () => {
  it('always carries a visible Persian text label, not color alone', () => {
    render(<BestPriceBadge />);
    expect(screen.getByText('بهترین قیمت')).toBeInTheDocument();
  });
});

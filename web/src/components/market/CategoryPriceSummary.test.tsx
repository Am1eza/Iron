import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CategoryPriceSummary } from './CategoryPriceSummary';
import type { Category, PriceRow } from '@/lib/types/domain';

const categories = [
  { id: 'c1', slug: 'rebar', name: 'میلگرد', order: 1, isActive: true },
  { id: 'c2', slug: 'beam', name: 'تیرآهن', order: 2, isActive: true },
] as unknown as Category[];

function row(over: Partial<PriceRow> & { id: string; categoryId: string }): PriceRow {
  return {
    subCategoryId: 'sub',
    slug: `${over.id}-slug`,
    name: `محصول ${over.id}`,
    size: '18',
    factory: 'ذوب آهن',
    unit: 'kg',
    current: {
      skuId: over.id,
      price: 32500,
      unit: 'kg',
      deliveryTime: '۲ روز کاری',
      vatIncluded: false,
      movementPct: 1.2,
      movementDir: 'up',
      updatedAt: '2026-08-17T08:00:00.000Z',
      isStale: false,
      priceHidden: false,
    },
    ...over,
  } as PriceRow;
}

describe('CategoryPriceSummary', () => {
  it('renders one row per category, labelled with the category name', () => {
    render(
      <CategoryPriceSummary
        rows={[row({ id: 'a', categoryId: 'rebar' }), row({ id: 'b', categoryId: 'beam' })]}
        categories={categories}
      />,
    );
    // Category name appears in both the desktop table and the mobile card list.
    expect(screen.getAllByText('میلگرد').length).toBeGreaterThan(0);
    expect(screen.getAllByText('تیرآهن').length).toBeGreaterThan(0);
    expect(screen.getAllByText('محصول a').length).toBe(2);
  });

  it('links each row to its SKU page and to the full category table', () => {
    render(<CategoryPriceSummary rows={[row({ id: 'a', categoryId: 'rebar' })]} categories={categories} />);
    const sku = screen.getAllByRole('link', { name: 'محصول a' })[0];
    expect(sku).toHaveAttribute('href', '/prices/rebar/sub/a-slug');
    // Two by design: the table's chevron and the mobile card's text link.
    const full = screen.getAllByRole('link', { name: 'جدول کامل میلگرد' });
    expect(full).toHaveLength(2);
    for (const link of full) expect(link).toHaveAttribute('href', '/prices/rebar');
  });

  it('shows «تماس بگیرید» instead of a number when the price is stale-hidden', () => {
    const hidden = row({ id: 'a', categoryId: 'rebar' });
    hidden.current = { ...hidden.current, price: 0, priceHidden: true, deliveryTime: '' };
    render(<CategoryPriceSummary rows={[hidden]} categories={categories} />);
    expect(screen.getAllByText('تماس بگیرید').length).toBeGreaterThan(0);
    // No fabricated zero price leaks into the published summary.
    expect(screen.queryByText('۰')).toBeNull();
  });

  it('renders nothing when there are no rows (never an empty table shell)', () => {
    const { container } = render(<CategoryPriceSummary rows={[]} categories={categories} />);
    expect(container).toBeEmptyDOMElement();
  });
});

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CategoryRail } from './CategoryRail';
import type { CategoryRailItem } from '@/lib/server/catalog';

const rebar: CategoryRailItem = { slug: 'rebar', name: 'میلگرد', imageUrl: '/uploads/rebar.jpg', count: 12 };
const ibeam: CategoryRailItem = { slug: 'ibeam', name: 'تیرآهن', imageUrl: null, count: 3 };

describe('CategoryRail', () => {
  it('renders nothing when there are no categories with articles', () => {
    const { container } = render(<CategoryRail items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('links each tile to its category page, with the name and Persian-digit count', () => {
    render(<CategoryRail items={[rebar]} />);
    const link = screen.getByRole('link', { name: /میلگرد/ });
    expect(link).toHaveAttribute('href', '/blog/category/rebar');
    expect(screen.getByText('۱۲ مقاله')).toBeInTheDocument();
  });

  it('marks the active category current, and no other', () => {
    render(<CategoryRail items={[rebar, ibeam]} activeSlug="rebar" />);
    expect(screen.getByRole('link', { name: /میلگرد/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /تیرآهن/ })).not.toHaveAttribute('aria-current');
  });

  it('sets the background photo from imageUrl when present', () => {
    render(<CategoryRail items={[rebar]} />);
    const link = screen.getByRole('link', { name: /میلگرد/ });
    expect(link.style.backgroundImage).toContain('/uploads/rebar.jpg');
  });

  it('falls back to a plain tile (no inline background image) when imageUrl is null', () => {
    render(<CategoryRail items={[ibeam]} />);
    const link = screen.getByRole('link', { name: /تیرآهن/ });
    expect(link.style.backgroundImage).toBe('');
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import NotFound from './not-found';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

describe('404 page (US-P0.8)', () => {
  it('shows an unambiguous "not found" glyph, not the generic I-beam empty-state icon', () => {
    const { container } = render(<NotFound />);
    // The default EmptyState glyph (IBeamGlyph) draws a single vertical bar
    // with two crossbars; SearchOffIcon draws a circle (the lens) — that's
    // the cheapest reliable signal the right glyph was actually passed.
    expect(container.querySelector('svg circle')).not.toBeNull();
  });

  it('has a real, working search field — not just a promise to "use search"', async () => {
    render(<NotFound />);
    const search = screen.getByRole('search');
    expect(search).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: /جستجو/ })).toBeInTheDocument();
  });

  it('still offers the way-home links the audit expects', () => {
    render(<NotFound />);
    expect(screen.getByRole('link', { name: 'بازگشت به خانه' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'مشاهدهٔ قیمت‌ها' })).toBeInTheDocument();
  });
});

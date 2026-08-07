import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Sparkline } from './Sparkline';

describe('Sparkline', () => {
  it('renders nothing for fewer than 2 points — no partial/broken mark for insufficient data', () => {
    const { container } = render(<Sparkline points={[100]} />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('renders an svg path for 2+ points', () => {
    const { container } = render(<Sparkline points={[100, 120, 90, 130]} />);
    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.querySelector('path')).not.toBeNull();
  });

  it('is decorative — aria-hidden, never the only trend signal (the row also has MovementBadge)', () => {
    const { container } = render(<Sparkline points={[100, 120]} />);
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('places the current (last) point on the LEFT — same RTL time convention as PriceChart.tsx', () => {
    const { container } = render(<Sparkline points={[100, 200]} />);
    const dot = container.querySelector('circle');
    const path = container.querySelector('path');
    // The path's first command starts at a higher x than the dot's cx —
    // i.e. the oldest point (path start) is to the right of the newest
    // point (the dot), matching "newest on the left, reads right→left".
    const firstX = Number(path!.getAttribute('d')!.match(/M\s*([\d.]+)/)![1]);
    const dotX = Number(dot!.getAttribute('cx'));
    expect(firstX).toBeGreaterThan(dotX);
  });
});

import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CountUp } from './CountUp';

vi.mock('@/lib/hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));
vi.mock('@/lib/hooks/useIntersectionObserver', () => ({
  useIntersectionObserver: () => ({ ref: { current: null }, isIntersecting: true }),
}));
let frame: FrameRequestCallback;
beforeEach(() => {
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      frame = callback;
      return 1;
    }),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

describe('CountUp animation lifecycle', () => {
  it('does no animation work for an unchanged initial value', () => {
    render(<CountUp value={100} />);
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });

  it.each([0, -1, Infinity, NaN])('settles immediately for duration %s', (duration) => {
    const { rerender } = render(<CountUp value={100} duration={duration} />);
    rerender(<CountUp value={200} duration={duration} />);
    expect(screen.getAllByText('۲۰۰')).toHaveLength(2);
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });

  it('continues an interrupted animation from the displayed value', () => {
    const { rerender, unmount } = render(<CountUp value={100} duration={1} />);
    rerender(<CountUp value={200} duration={1} />);
    act(() => frame(0));
    act(() => frame(500));
    expect(screen.getByText('۱۸۸')).toBeInTheDocument();
    rerender(<CountUp value={300} duration={1} />);
    act(() => frame(600));
    expect(screen.getByText('۱۸۸')).toBeInTheDocument();
    unmount();
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });
});

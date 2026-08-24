import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { ReadingProgress } from './ReadingProgress';

afterEach(cleanup);

// jsdom has no requestAnimationFrame (real browsers always do) — run the
// callback synchronously so the scroll-driven update is observable in tests.
beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

// jsdom never lays out real content, so scrollHeight/clientHeight/scrollY are
// stubbed directly rather than relying on rendered geometry.
function stubScrollGeometry({ scrollHeight = 2000, clientHeight = 800, scrollY = 0 }) {
  Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: scrollHeight });
  Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, value: clientHeight });
  Object.defineProperty(window, 'scrollY', { configurable: true, value: scrollY });
}

describe('ReadingProgress', () => {
  it('is decorative — hidden from assistive tech', () => {
    stubScrollGeometry({});
    const { container } = render(<ReadingProgress />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('starts at 0% before any scroll', () => {
    stubScrollGeometry({});
    const { container } = render(<ReadingProgress />);
    const bar = container.querySelector('div > div > div') as HTMLDivElement;
    expect(bar.style.inlineSize).toBe('0%');
  });

  it('fills proportionally to scroll position on scroll', () => {
    stubScrollGeometry({ scrollHeight: 2000, clientHeight: 800, scrollY: 0 });
    const { container } = render(<ReadingProgress />);
    const bar = container.querySelector('div > div > div') as HTMLDivElement;

    // scrollable = 2000 - 800 = 1200; halfway down = 600px scrolled = 50%.
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 600 });
    fireEvent.scroll(window);
    expect(bar.style.inlineSize).toBe('50%');
  });
});

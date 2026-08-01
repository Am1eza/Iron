import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { HeroVideo } from './HeroVideo';

type Nav = Navigator & { connection?: { saveData?: boolean; effectiveType?: string } };

function mockMatchMedia(matching: string[]) {
  window.matchMedia = ((query: string) =>
    ({
      matches: matching.includes(query),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
}

afterEach(() => {
  mockMatchMedia([]);
  delete (window.navigator as Nav).connection;
});

describe('HeroVideo — fallback-first upgrade (W: hero video performance)', () => {
  it('shows the fallback board immediately — before the effect ever runs', () => {
    mockMatchMedia([]);
    render(<HeroVideo src="/media/hero.mp4" fallback={<div data-testid="board">تابلوی قیمت</div>} />);
    expect(screen.getByTestId('board')).toBeInTheDocument();
  });

  it('upgrades to <video> when nothing disqualifies the visitor', async () => {
    mockMatchMedia([]);
    render(<HeroVideo src="/media/hero.mp4" fallback={<div data-testid="board">تابلوی قیمت</div>} />);
    await waitFor(() => expect(document.querySelector('video')).toBeInTheDocument());
    expect(screen.queryByTestId('board')).not.toBeInTheDocument();
  });

  it('never mounts the video for prefers-reduced-motion — the CSS-only claim this replaces was false', async () => {
    mockMatchMedia(['(prefers-reduced-motion: reduce)']);
    render(<HeroVideo src="/media/hero.mp4" fallback={<div data-testid="board">تابلوی قیمت</div>} />);
    // Give the effect a tick to (not) run — asserting an absence needs a wait,
    // not just an immediate check, or a real bug could pass by accident.
    await new Promise((r) => setTimeout(r, 10));
    expect(document.querySelector('video')).not.toBeInTheDocument();
    expect(screen.getByTestId('board')).toBeInTheDocument();
  });

  it('never mounts the video under the mobile breakpoint — served the board instead, not a smaller video', async () => {
    mockMatchMedia(['(max-width: 767px)']);
    render(<HeroVideo src="/media/hero.mp4" fallback={<div data-testid="board">تابلوی قیمت</div>} />);
    await new Promise((r) => setTimeout(r, 10));
    expect(document.querySelector('video')).not.toBeInTheDocument();
  });

  it('upgrades to video regardless of navigator.connection — regression test for a real bug', async () => {
    // An earlier version gated on the Network Information API and treated a
    // reported save-data/slow-2g/3g as "skip the video". That API is
    // routinely spoofed or blocked by privacy-focused browsers/extensions
    // (Brave, several blockers) to resist fingerprinting — so it silently
    // hid the video for ordinary desktop visitors, including the site owner
    // on a normal connection. Confirmed live on production before this fix.
    mockMatchMedia([]);
    (window.navigator as Nav).connection = { saveData: true, effectiveType: '3g' };
    render(<HeroVideo src="/media/hero.mp4" fallback={<div data-testid="board">تابلوی قیمت</div>} />);
    await waitFor(() => expect(document.querySelector('video')).toBeInTheDocument());
  });

  it('derives sibling source/poster paths from `src` by stripping .mp4, in the documented fallback order', async () => {
    mockMatchMedia([]);
    render(<HeroVideo src="/media/hero.mp4" fallback={<div data-testid="board">تابلوی قیمت</div>} />);
    const video = await waitFor(() => {
      const el = document.querySelector('video');
      if (!el) throw new Error('not mounted yet');
      return el as HTMLVideoElement;
    });
    expect(video.getAttribute('poster')).toBe('/media/hero-poster.webp');
    const sources = Array.from(video.querySelectorAll('source')).map((s) => ({
      src: s.getAttribute('src'),
      type: s.getAttribute('type'),
      media: s.getAttribute('media'),
    }));
    expect(sources).toEqual([
      { src: '/media/hero-mobile.webm', type: 'video/webm', media: '(max-width: 1023px)' },
      { src: '/media/hero-mobile.mp4', type: 'video/mp4', media: '(max-width: 1023px)' },
      { src: '/media/hero.webm', type: 'video/webm', media: null },
      { src: '/media/hero.mp4', type: 'video/mp4', media: null },
    ]);
  });

  it('stays muted, looping and playsInline — never audible, never fullscreens on iOS', async () => {
    mockMatchMedia([]);
    render(<HeroVideo src="/media/hero.mp4" fallback={<div data-testid="board">تابلوی قیمت</div>} />);
    const video = await waitFor(() => {
      const el = document.querySelector('video');
      if (!el) throw new Error('not mounted yet');
      return el as HTMLVideoElement;
    });
    expect(video.muted).toBe(true);
    expect(video.loop).toBe(true);
    expect(video.hasAttribute('playsInline') || video.hasAttribute('playsinline')).toBe(true);
  });
});

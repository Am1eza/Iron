import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { HeroVideo } from './HeroVideo';

// jsdom's HTMLMediaElement has no real playback engine — stub play/pause so
// the component's calls to them don't throw, matching how a real browser's
// autoplay/click-to-pause actually behaves for these tests' purposes.
HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
HTMLMediaElement.prototype.pause = vi.fn();

describe('HeroVideo — always renders the video, no fallback/upgrade step (W: no table flash)', () => {
  it('renders a <video> synchronously, on first render — no gating, no wait', () => {
    render(<HeroVideo src="/media/hero.mp4" />);
    expect(document.querySelector('video')).toBeInTheDocument();
  });

  it('never renders a price-table fallback — that flash/no-show bug is what this replaces', () => {
    const { container } = render(<HeroVideo src="/media/hero.mp4" />);
    // The old fallback-first version rendered whatever `fallback` prop was
    // passed; this version doesn't accept one at all, so there is nothing
    // else in the tree besides the video frame.
    expect(container.querySelectorAll('video').length).toBe(1);
  });

  it('derives sibling source/poster paths from `src` by stripping .mp4, in the documented fallback order', () => {
    render(<HeroVideo src="/media/hero.mp4" />);
    const video = document.querySelector('video') as HTMLVideoElement;
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

  it('stays muted, looping and playsInline — never audible, never fullscreens on iOS', () => {
    render(<HeroVideo src="/media/hero.mp4" />);
    const video = document.querySelector('video') as HTMLVideoElement;
    expect(video.muted).toBe(true);
    expect(video.loop).toBe(true);
    expect(video.hasAttribute('playsInline') || video.hasAttribute('playsinline')).toBe(true);
    expect(video.autoplay).toBe(true);
  });
});

describe('HeroVideo — pause control (WCAG 2.2.2 Pause, Stop, Hide)', () => {
  it('offers a visible, keyboard-reachable pause control — not hidden by the frame\'s aria-hidden', () => {
    // Regression: aria-hidden must be on the <video> only, not the wrapping
    // frame — an aria-hidden ancestor removes this button from the
    // accessibility tree entirely, which would defeat the whole fix.
    render(<HeroVideo src="/media/hero.mp4" />);
    const btn = document.querySelector('button');
    expect(btn).toBeInTheDocument();
    expect(btn).not.toHaveAttribute('aria-hidden');
    expect(btn?.getAttribute('aria-label')).toBe('توقف ویدیوی پس‌زمینه');
  });

  it('pauses the video and flips the label on click, then resumes on a second click', () => {
    render(<HeroVideo src="/media/hero.mp4" />);
    const video = document.querySelector('video') as HTMLVideoElement;
    const btn = document.querySelector('button') as HTMLButtonElement;

    Object.defineProperty(video, 'paused', { value: false, configurable: true });
    fireEvent.click(btn);
    expect(video.pause).toHaveBeenCalled();
    expect(btn.getAttribute('aria-label')).toBe('پخش ویدیوی پس‌زمینه');

    Object.defineProperty(video, 'paused', { value: true, configurable: true });
    fireEvent.click(btn);
    expect(video.play).toHaveBeenCalled();
    expect(btn.getAttribute('aria-label')).toBe('توقف ویدیوی پس‌زمینه');
  });
});

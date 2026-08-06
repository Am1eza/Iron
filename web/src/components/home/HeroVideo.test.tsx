import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { HeroVideo } from './HeroVideo';

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

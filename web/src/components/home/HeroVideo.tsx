'use client';
import { useRef, useState } from 'react';
import { PauseIcon, PlayIcon } from '@/components/primitives/icons';
import styles from './HeroVideo.module.css';

/** Matches HeroSearch.module.css's own tablet breakpoint — the lighter
 *  `-mobile` encode is sized for that range (tablet AND phone), not full
 *  desktop. */
const LIGHT_SOURCE_BREAKPOINT = '(max-width: 1023px)';

/**
 * The hero motion-graphic slot — drops into the exact position the PriceBoard
 * occupies when the owner sets SITE_HERO_VIDEO in admin settings.
 *
 * Server-rendered directly and unconditionally, on every device — no
 * client-side "show the price table first, upgrade to video once mounted"
 * step. That upgrade-later approach used to cause a real, visible flash of
 * the table (1-5s on an ordinary connection) before the video took over,
 * and on an iOS home-screen web app it sometimes never upgraded at all.
 * Confirmed live by the owner on desktop, mobile browser, and an iOS
 * add-to-home-screen build; the fix is to not have an upgrade step — this
 * component IS the video, from the very first byte of HTML. `poster` is
 * what actually paints instantly while the video data streams in, so
 * there's still no blank flash even before playback starts. `'use client'`
 * only gates the pause BUTTON's interactivity below — the `<video>` tag
 * itself, `autoPlay` included, is still emitted in the server-rendered HTML
 * exactly as before; the anti-flash guarantee is unchanged.
 *
 * `prefers-reduced-motion` is deliberately NOT used to swap back to a
 * table — the owner explicitly asked for that swap removed after seeing
 * the flash it caused. WCAG 2.2.2 (Pause, Stop, Hide) is met the way this
 * component's own prior version proposed instead: a visible pause/play
 * control (mirrors the identical pattern in layout/Ticker.tsx), so a
 * motion-sensitive visitor can stop the loop without losing the video slot.
 *
 * Multiple `<source>`s, in order: a lighter/smaller-resolution encode for
 * the tablet+phone range (matches HeroSearch's own 1023px breakpoint)
 * before the full-size one, and WebM (VP9, meaningfully smaller) before MP4
 * (H.264, universal fallback) within each. Filenames are derived from `src`
 * by convention (see public/media/README.md) — if the optional variants or
 * the poster are missing, the browser just falls through to the one file
 * that's guaranteed to exist (`src` itself), no error.
 */
export function HeroVideo({ src }: { src: string }) {
  const base = src.replace(/\.mp4$/, '');
  const videoRef = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);

  const toggle = () => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play();
      setPaused(false);
    } else {
      el.pause();
      setPaused(true);
    }
  };

  return (
    <div className={styles.frame}>
      <video
        ref={videoRef}
        className={styles.video}
        poster={`${base}-poster.webp`}
        autoPlay
        muted
        loop
        playsInline
        aria-hidden="true"
        /* `metadata`, not `auto`: `auto` explicitly asks the browser to
           buffer the ENTIRE file (up to 936 KB for the desktop WebM) as fast
           as it can, competing with the rest of the hero's own critical-path
           resources. `metadata` lets autoplay pull only what it needs to
           start and then stream, which is what a muted background loop
           wants; autoplay still works, since the spec has autoplay override
           the preload hint once playback is requested. */
        preload="metadata"
        disablePictureInPicture
      >
        <source media={LIGHT_SOURCE_BREAKPOINT} src={`${base}-mobile.webm`} type="video/webm" />
        <source media={LIGHT_SOURCE_BREAKPOINT} src={`${base}-mobile.mp4`} type="video/mp4" />
        <source src={`${base}.webm`} type="video/webm" />
        <source src={src} type="video/mp4" />
      </video>
      <button
        type="button"
        className={styles.pause}
        onClick={toggle}
        // Same convention as layout/Ticker.tsx's pause control: the label
        // states the action and IS the accessible name (not a title tooltip,
        // which touch users never see); no aria-pressed alongside it, since
        // a label that already flips between «توقف» and «پخش» would make a
        // screen reader announce the same fact twice.
        aria-label={paused ? 'پخش ویدیوی پس‌زمینه' : 'توقف ویدیوی پس‌زمینه'}
        data-paused={paused ? '' : undefined}
      >
        {paused ? <PlayIcon size={16} /> : <PauseIcon size={16} />}
      </button>
    </div>
  );
}

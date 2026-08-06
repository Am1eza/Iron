'use client';
import { useEffect, useState, type ReactNode } from 'react';
import styles from './HeroVideo.module.css';

/** Matches HeroSearch.module.css's own tablet breakpoint, where the board
 *  slot is already shrunk — the lighter `-mobile` encode is sized for that
 *  range (tablet AND phone), not full desktop. This used to also be the
 *  point below which video was skipped outright in favour of the price-board
 *  fallback; the owner wants the video consistently, on every device, so
 *  phones now get this same lighter encode instead of losing the video. */
const LIGHT_SOURCE_BREAKPOINT = '(max-width: 1023px)';

/** Deliberately does NOT check `navigator.connection` (Network Information
 * API) — a first version of this did, and it was wrong to: the API is
 * commonly spoofed or blocked outright by privacy-focused browsers and
 * extensions (Brave, several ad/tracker blockers) specifically to reduce
 * fingerprinting surface, which means it can report a fast connection as
 * `slow-2g`/`3g` for reasons having nothing to do with actual speed. That
 * silently killed the video for ordinary desktop visitors — including the
 * site owner testing on their own connection.
 *
 * The one thing this still declines for is `prefers-reduced-motion` — that
 * is not a bandwidth heuristic but an explicit, OS-level accessibility
 * signal from a visitor who gets real physical symptoms (nausea, vertigo)
 * from autoplaying motion; it stays even though every other gate here was
 * removed so the owner gets the video consistently on every device. */
function videoIsWorthIt(): boolean {
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * The hero motion-graphic slot — drops into the exact position the PriceBoard
 * occupies when the owner sets SITE_HERO_VIDEO in admin settings.
 *
 * `fallback` (the real PriceBoard, server-rendered) is what's shown FIRST,
 * always — on every device, with JS or without. Only once mounted do we
 * decide, client-side, whether THIS visitor should upgrade to video: every
 * viewport qualifies now (phones use the lighter `-mobile` encode below),
 * the only disqualifier left is `prefers-reduced-motion`. This is why the
 * server-rendered HTML and the pre-effect client render are IDENTICAL
 * (both show `fallback`) — no hydration mismatch, and a reduced-motion
 * visitor never requests a single byte of video.
 *
 * For visitors who DO qualify, mounting the `<video>` is itself deferred to
 * just after `window.load`, so it never competes with the page's own
 * critical-path resources — the fallback board is what visitors actually
 * see (and what LCP measures) for that first moment regardless of tier.
 *
 * Multiple `<source>`s, in order: a lighter/smaller-resolution encode for
 * the tablet range (matches HeroSearch's own 1023px breakpoint) before the
 * full-size one, and WebM (VP9, meaningfully smaller) before MP4 (H.264,
 * universal fallback) within each. Filenames are derived from `src` by
 * convention (see public/media/README.md) — if the optional variants or the
 * poster are missing, the browser just falls through to the one file that's
 * guaranteed to exist (`src` itself), no error.
 */
export function HeroVideo({ src, fallback }: { src: string; fallback: ReactNode }) {
  const [showVideo, setShowVideo] = useState(false);

  useEffect(() => {
    if (!videoIsWorthIt()) return;
    let cancelled = false;
    const upgrade = () => {
      if (!cancelled) setShowVideo(true);
    };
    if (document.readyState === 'complete') {
      const id = window.setTimeout(upgrade, 0);
      return () => {
        cancelled = true;
        window.clearTimeout(id);
      };
    }
    window.addEventListener('load', upgrade, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener('load', upgrade);
    };
  }, []);

  if (!showVideo) return <>{fallback}</>;

  const base = src.replace(/\.mp4$/, '');
  return (
    <div className={styles.frame} aria-hidden="true">
      <video
        className={styles.video}
        poster={`${base}-poster.webp`}
        autoPlay
        muted
        loop
        playsInline
        /* `metadata`, not `auto`. 7e3dbf6 already moved the mount itself past
           `window.load`, so this is off the LCP path — but `auto` explicitly
           asks the browser to buffer the ENTIRE file (up to 936 KB for the
           desktop WebM) as fast as it can, competing with the fetches a
           visitor's first interaction triggers. `metadata` lets autoplay pull
           only what it needs to start and then stream, which is what a muted
           background loop wants; autoplay still works, since the spec has
           autoplay override the preload hint once playback is requested. */
        preload="metadata"
        disablePictureInPicture
      >
        <source media={LIGHT_SOURCE_BREAKPOINT} src={`${base}-mobile.webm`} type="video/webm" />
        <source media={LIGHT_SOURCE_BREAKPOINT} src={`${base}-mobile.mp4`} type="video/mp4" />
        <source src={`${base}.webm`} type="video/webm" />
        <source src={src} type="video/mp4" />
      </video>
    </div>
  );
}

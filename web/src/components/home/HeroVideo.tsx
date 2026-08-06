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
 * there's still no blank flash even before playback starts.
 *
 * This is also why `prefers-reduced-motion` is no longer checked here: that
 * gate fell back to the same table, which the owner explicitly asked to
 * remove after seeing it happen. A future motion-sensitive-visitor control
 * should be a visible pause/mute affordance, not a silent server-side swap
 * back to a table.
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
  return (
    <div className={styles.frame} aria-hidden="true">
      <video
        className={styles.video}
        poster={`${base}-poster.webp`}
        autoPlay
        muted
        loop
        playsInline
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
    </div>
  );
}

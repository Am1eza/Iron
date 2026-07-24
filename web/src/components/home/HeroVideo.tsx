import styles from './HeroVideo.module.css';

/**
 * The hero motion-graphic slot — drops into the exact position the PriceBoard
 * occupies when the owner sets SITE_HERO_VIDEO in admin settings. Muted,
 * looping, autoplaying (the only autoplay browsers allow), playsInline so iOS
 * never fullscreens it. Decorative: no audio, no controls, aria-hidden — the
 * hero copy carries the message. `prefers-reduced-motion` users get a paused
 * first frame via the CSS (animation-less; the video is not played by script).
 */
export function HeroVideo({ src }: { src: string }) {
  return (
    <div className={styles.frame} aria-hidden="true">
      <video
        className={styles.video}
        src={src}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        disablePictureInPicture
      />
    </div>
  );
}

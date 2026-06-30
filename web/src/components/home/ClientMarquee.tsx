'use client';
import { useState } from 'react';
import { clientLogos, type ClientLogo } from '../../../public/assets/logos/clients';
import styles from './ClientMarquee.module.css';

/**
 * Trusted-by wall — an auto-scrolling («rotating») marquee of client logos.
 * Companies with an optimized logo file show the image (grayscale → color on
 * hover); the rest show a clean on-brand name chip that upgrades to the real
 * logo automatically once a file is added (hasLogo). Pauses on hover; collapses
 * to a static centered wrap under prefers-reduced-motion.
 */
function Item({ c, dup }: { c: ClientLogo; dup?: boolean }) {
  const [errored, setErrored] = useState(false);
  const showImg = c.hasLogo && !errored;
  return (
    <li className={styles.item} data-dup={dup ? '' : undefined} aria-hidden={dup ? true : undefined}>
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={c.file}
          alt={c.name}
          title={c.nameFa}
          className={styles.logo}
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setErrored(true)}
        />
      ) : (
        <span className={styles.chip} title={c.name}>
          <span className={styles.mono} aria-hidden="true">{c.monogram}</span>
          <span className={styles.chipName}>{c.nameFa}</span>
        </span>
      )}
    </li>
  );
}

export function ClientMarquee() {
  return (
    <div className={styles.viewport} role="group" aria-label="مشتریانی که به آهن‌تایم اعتماد کرده‌اند">
      <ul className={styles.track} role="list">
        {clientLogos.map((c) => (
          <Item key={c.slug} c={c} />
        ))}
        {/* visual duplicate for the seamless loop (hidden from assistive tech) */}
        {clientLogos.map((c) => (
          <Item key={`dup-${c.slug}`} c={c} dup />
        ))}
      </ul>
    </div>
  );
}

import type { ReactNode } from 'react';
import { Reveal } from '@/components/motion/Reveal';
import styles from './FeatureGrid.module.css';

/**
 * FeatureGrid — a calm grid of value-proposition cards, each with a single
 * tinted icon chip (amber by default; cobalt `accent` reserved for AI/info).
 * Server component; no client state. Used by the «چرا آهن‌تایم» page and the
 * «خدمات ما» block on «درباره ما».
 */
export type Feature = {
  /** Stable key + heading. */
  title: string;
  desc: string;
  icon: ReactNode;
  /** Use the cobalt accent (AI / informational only). */
  accent?: boolean;
};

export function FeatureGrid({ items }: { items: Feature[] }) {
  return (
    <ul className={styles.grid}>
      {items.map((f, i) => (
        <li key={f.title}>
          <Reveal index={i % 3} className={styles.card}>
            <span
              className={[styles.icon, f.accent ? styles.iconAccent : ''].filter(Boolean).join(' ')}
              aria-hidden="true"
            >
              {f.icon}
            </span>
            <h3 className={styles.title}>{f.title}</h3>
            <p className={styles.desc}>{f.desc}</p>
          </Reveal>
        </li>
      ))}
    </ul>
  );
}

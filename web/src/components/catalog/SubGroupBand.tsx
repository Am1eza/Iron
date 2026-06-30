'use client';
import { CategoryArt } from './CategoryArt';
import type { SubCat } from '@/lib/data/nav';
import styles from './SubGroupBand.module.css';

/**
 * Sub-group selector band — large, tappable cards (one per sub-category + «همه»)
 * shown above the price table so non-tech users pick a family *first*, then read
 * the filtered table. Selection is lifted to the parent and kept in sync with the
 * table toolbar chips. Accessible: aria-pressed buttons, keyboard focusable,
 * reduced-motion safe.
 */
export function SubGroupBand({
  category,
  subs,
  active,
  onSelect,
}: {
  category: string;
  subs: SubCat[];
  active: string | null;
  onSelect: (sub: string | null) => void;
}) {
  if (subs.length === 0) return null;

  return (
    <nav className={styles.band} aria-label="انتخاب گروه محصول">
      <button
        type="button"
        className={styles.card}
        aria-pressed={active === null}
        data-active={active === null ? '' : undefined}
        onClick={() => onSelect(null)}
      >
        <span className={styles.icon} aria-hidden="true">
          <CategoryArt slug={category} size={36} />
        </span>
        <span className={styles.label}>همه</span>
      </button>

      {subs.map((s) => (
        <button
          key={s.slug}
          type="button"
          className={styles.card}
          aria-pressed={active === s.slug}
          data-active={active === s.slug ? '' : undefined}
          onClick={() => onSelect(s.slug)}
        >
          <span className={styles.icon} aria-hidden="true">
            <CategoryArt slug={category} size={36} />
          </span>
          <span className={styles.label}>{s.name}</span>
        </button>
      ))}
    </nav>
  );
}

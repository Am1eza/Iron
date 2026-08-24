'use client';
import { useId } from 'react';
import styles from './Switch.module.css';

/**
 * A5 · Switch (toggle) — used for the VAT / unit toggles. Accessible labeled
 * switch; keyboard Space/Enter via the native checkbox.
 */
export function Switch({
  checked,
  onChange,
  label,
  hideLabel = false,
  disabled = false,
  size = 'md',
  ariaLabel,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hideLabel?: boolean;
  disabled?: boolean;
  /** `sm` is a lighter track for a secondary toggle riding alongside a more
   *  important control on the same bar — PriceTable's «فقط قیمت‌دار» filter
   *  sits next to the VAT switch and must not compete with it. */
  size?: 'md' | 'sm';
  /** Overrides the accessible name when the same visible label repeats many
   *  times on one page (one VAT toggle per factory section), so a screen-reader
   *  user can tell which section a switch belongs to. MUST still contain
   *  `label` verbatim — WCAG 2.2 §2.5.3 Label in Name. */
  ariaLabel?: string;
}) {
  const id = useId();
  return (
    <label
      className={size === 'sm' ? `${styles.wrap} ${styles.sm}` : styles.wrap}
      htmlFor={id}
      data-disabled={disabled ? '' : undefined}
    >
      <input
        id={id}
        type="checkbox"
        role="switch"
        className={styles.input}
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className={styles.track} aria-hidden="true">
        <span className={styles.thumb} />
      </span>
      <span className={hideLabel ? 'visually-hidden' : styles.label}>{label}</span>
    </label>
  );
}

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
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hideLabel?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <label className={styles.wrap} htmlFor={id} data-disabled={disabled ? '' : undefined}>
      <input
        id={id}
        type="checkbox"
        role="switch"
        className={styles.input}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className={styles.track} aria-hidden="true">
        <span className={styles.thumb} />
      </span>
      <span className={hideLabel ? 'visually-hidden' : styles.label}>{label}</span>
    </label>
  );
}

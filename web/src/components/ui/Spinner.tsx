import styles from './Spinner.module.css';

/** B7 · Spinner — a 2px cobalt arc. Sizes 16/20/24. Decorative by default. */
export function Spinner({
  size = 20,
  label,
}: {
  size?: 16 | 20 | 24 | number;
  label?: string;
}) {
  return (
    <span
      className={styles.spinner}
      style={{ inlineSize: size, blockSize: size }}
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}

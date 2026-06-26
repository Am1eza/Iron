import styles from './Avatar.module.css';

/** B4 · Avatar — circular user mark; falls back to the first initial of the name. */
export function Avatar({
  name,
  src,
  size = 36,
}: {
  name?: string;
  src?: string;
  size?: number;
}) {
  const initial = (name ?? '').trim().charAt(0) || '؟';
  return (
    <span className={styles.avatar} style={{ inlineSize: size, blockSize: size }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className={styles.img} />
      ) : (
        <span aria-hidden="true" className={styles.initial}>
          {initial}
        </span>
      )}
    </span>
  );
}

/**
 * B4 · Logo Frame — fixed-ratio frame for mill/customer logos (mono/duotone).
 * Missing logo → branded placeholder (the label, quietly).
 */
export function LogoFrame({ name, src }: { name: string; src?: string }) {
  return (
    <span className={styles.frame} title={name}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} className={styles.frameImg} />
      ) : (
        <span className={styles.framePlaceholder}>{name}</span>
      )}
    </span>
  );
}

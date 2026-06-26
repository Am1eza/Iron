import type { CSSProperties, ElementType, ReactNode } from 'react';
import styles from './Layout.module.css';

/**
 * Layout primitives (Grid System + Spacing). Everything composes the 4px spacing
 * scale via the `--space-N` tokens — no off-grid values. RTL-safe (logical props).
 */

type SpaceStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12 | 16 | 20 | 24;
const space = (n: SpaceStep) => `var(--space-${n})`;

type Width = 'wide' | 'max' | 'narrow' | 'prose';

/** Centered page container with the standard responsive gutter. */
export function Container({
  width = 'max',
  children,
  className,
}: {
  width?: Width;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[styles.container, className].filter(Boolean).join(' ')}
      style={{ '--container-w': `var(--container-${width})` } as CSSProperties}
    >
      {children}
    </div>
  );
}

/** A vertical page section with consistent block padding. */
export function Section({
  space: pad = 12,
  children,
  className,
  'aria-labelledby': labelledby,
  'aria-label': label,
}: {
  space?: SpaceStep;
  children: ReactNode;
  className?: string;
  'aria-labelledby'?: string;
  'aria-label'?: string;
}) {
  return (
    <section
      className={[styles.section, className].filter(Boolean).join(' ')}
      style={{ paddingBlock: space(pad) }}
      aria-labelledby={labelledby}
      aria-label={label}
    >
      {children}
    </section>
  );
}

/** Vertical flow with a uniform gap. */
export function Stack({
  gap = 4,
  align,
  as: Tag = 'div',
  children,
  className,
}: {
  gap?: SpaceStep;
  align?: CSSProperties['alignItems'];
  as?: ElementType;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Tag
      className={[styles.stack, className].filter(Boolean).join(' ')}
      style={{ gap: space(gap), alignItems: align }}
    >
      {children}
    </Tag>
  );
}

/** Horizontal, wrapping group with a uniform gap (RTL row). */
export function Cluster({
  gap = 2,
  align = 'center',
  justify,
  as: Tag = 'div',
  children,
  className,
}: {
  gap?: SpaceStep;
  align?: CSSProperties['alignItems'];
  justify?: CSSProperties['justifyContent'];
  as?: ElementType;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Tag
      className={[styles.cluster, className].filter(Boolean).join(' ')}
      style={{ gap: space(gap), alignItems: align, justifyContent: justify }}
    >
      {children}
    </Tag>
  );
}

/** Responsive auto-fit grid; `min` is the minimum column width. */
export function Grid({
  gap = 4,
  min = '240px',
  cols,
  children,
  className,
}: {
  gap?: SpaceStep;
  min?: string;
  /** Fixed column count (overrides auto-fit). */
  cols?: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[styles.grid, className].filter(Boolean).join(' ')}
      style={{
        gap: space(gap),
        gridTemplateColumns: cols
          ? `repeat(${cols}, minmax(0, 1fr))`
          : `repeat(auto-fit, minmax(min(${min}, 100%), 1fr))`,
      }}
    >
      {children}
    </div>
  );
}

/** Hairline divider; optional centered I-beam motif. */
export function Divider({ label }: { label?: string }) {
  if (label) {
    return (
      <div className={styles.dividerLabeled} role="separator" aria-label={label}>
        <span className={styles.dividerLine} />
        <span className={styles.dividerText}>{label}</span>
        <span className={styles.dividerLine} />
      </div>
    );
  }
  return <hr className={styles.divider} />;
}

/** Explicit spacer for the rare case flow gaps can't cover. */
export function Spacer({ size = 4 }: { size?: SpaceStep }) {
  return <div aria-hidden style={{ blockSize: space(size) }} />;
}

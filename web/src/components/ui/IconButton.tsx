'use client';
import { forwardRef, type ReactNode } from 'react';
import styles from './IconButton.module.css';

type Variant = 'ghost' | 'solid' | 'subtle';
type Size = 'sm' | 'md';

export type IconButtonProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'children'
> & {
  /** Required — icon buttons must be labeled for screen readers. */
  label: string;
  icon: ReactNode;
  variant?: Variant;
  size?: Size;
  active?: boolean;
};

/** Icon button (A1 · icon variant). Hit area: sm 36px, md 40px, lg 44px — all
 *  clear WCAG 2.5.8 AA (24px min); mandatory `label`. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, variant = 'ghost', size = 'md', active, className, ...rest },
  ref,
) {
  return (
    <button
      {...rest}
      ref={ref}
      type={rest.type ?? 'button'}
      aria-label={label}
      title={label}
      aria-pressed={active}
      data-active={active ? '' : undefined}
      className={[styles.btn, styles[variant], styles[size], className]
        .filter(Boolean)
        .join(' ')}
    >
      {icon}
    </button>
  );
});

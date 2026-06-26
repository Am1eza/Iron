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

/** Icon button (A1 · icon variant). Always 40–44px hit area; mandatory `label`. */
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

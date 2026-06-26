'use client';
import { forwardRef, useRef } from 'react';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import styles from './Button.module.css';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
};

/**
 * Button primitive (Components A1). Primary fires the amber Spark on press.
 * (Broader variants/states are formalized in the UI Primitives section.)
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, fullWidth = false, children, onClick, disabled, ...rest },
  ref,
) {
  const innerRef = useRef<HTMLButtonElement | null>(null);
  const reduced = useReducedMotion();

  const setRefs = (el: HTMLButtonElement | null) => {
    innerRef.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) ref.current = el;
  };

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (variant === 'primary' && !reduced && innerRef.current) {
      const el = innerRef.current;
      el.classList.remove('spark');
      void el.offsetWidth; // reflow → replay the one-shot Spark
      el.classList.add('spark');
    }
    onClick?.(e);
  };

  const className = [
    styles.btn,
    styles[variant],
    styles[size],
    fullWidth ? styles.full : '',
    rest.className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      {...rest}
      ref={setRefs}
      className={className}
      onClick={handleClick}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading ? <span className={styles.spinner} aria-hidden /> : null}
      {children}
    </button>
  );
});

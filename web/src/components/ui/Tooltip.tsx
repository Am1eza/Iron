'use client';
import { useId, useState, type ReactNode } from 'react';
import styles from './Tooltip.module.css';

/**
 * B5 · Tooltip — dark surface, 150ms delay, shown on hover/focus. Never the only
 * source of essential info. The trigger must be a focusable element.
 */
export function Tooltip({
  content,
  children,
  placement = 'top',
}: {
  content: ReactNode;
  children: ReactNode;
  placement?: 'top' | 'bottom';
}) {
  const id = useId();
  const [open, setOpen] = useState(false);

  return (
    <span
      className={styles.wrap}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={() => setOpen(false)}
    >
      <span aria-describedby={open ? id : undefined}>{children}</span>
      <span
        role="tooltip"
        id={id}
        className={`${styles.bubble} ${placement === 'bottom' ? styles.bottom : styles.top}`}
        data-open={open ? '' : undefined}
      >
        {content}
      </span>
    </span>
  );
}

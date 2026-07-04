'use client';
import { useId, useState, useEffect, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import styles from './Tooltip.module.css';

/**
 * B5 · Tooltip — dark surface, 150ms delay, shown on hover/focus, dismissible
 * via Esc (WCAG 1.4.13). Never the only source of essential info. The trigger
 * must be a single focusable element — `aria-describedby` is injected onto it
 * directly (not a wrapping span) so assistive tech announces the tooltip text
 * when the trigger itself receives focus.
 */
export function Tooltip({
  content,
  children,
  placement = 'top',
}: {
  content: ReactNode;
  children: ReactElement;
  placement?: 'top' | 'bottom';
}) {
  const id = useId();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const trigger = isValidElement(children)
    ? cloneElement(children, { 'aria-describedby': open ? id : undefined } as Record<string, unknown>)
    : children;

  return (
    <span
      className={styles.wrap}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={() => setOpen(false)}
    >
      {trigger}
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

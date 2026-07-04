'use client';
import { useId, type ReactNode } from 'react';
import { useFocusTrap } from '@/lib/hooks/useFocusTrap';
import { CloseIcon } from '@/components/primitives/icons';
import styles from './Modal.module.css';

/**
 * C3 · Modal / Dialog — scrim + centered panel. Focus-trapped, Esc/scrim closes,
 * focus returns to the trigger, body scroll locked. `role="dialog" aria-modal`.
 * On mobile it docks to the bottom as a sheet (C4).
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const panelRef = useFocusTrap<HTMLDivElement>(open, onClose);
  const titleId = useId();

  if (!open) return null;

  return (
    <div className={styles.root}>
      <div className={styles.scrim} onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className={styles.head}>
          <h2 id={titleId} className={styles.title}>{title}</h2>
          <button
            type="button"
            className={styles.close}
            aria-label="بستن"
            data-autofocus
            onClick={onClose}
          >
            <CloseIcon size={20} />
          </button>
        </header>
        <div className={styles.body}>{children}</div>
        {footer ? <footer className={styles.footer}>{footer}</footer> : null}
      </div>
    </div>
  );
}

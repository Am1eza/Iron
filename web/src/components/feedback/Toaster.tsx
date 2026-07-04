'use client';
import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useUiStore, type Toast } from '@/lib/stores/ui';
import styles from './toaster.module.css';

const AUTO_DISMISS_MS = 4000;

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const remaining = useRef(AUTO_DISMISS_MS);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const start = () => {
    startedAt.current = Date.now();
    timer.current = setTimeout(() => onDismiss(toast.id), remaining.current);
  };
  const pause = () => {
    if (!timer.current) return;
    clearTimeout(timer.current);
    remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt.current));
  };

  useEffect(() => {
    start();
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast.id]);

  return (
    <div
      className={`${styles.toast} ${styles[toast.variant]}`}
      // role="alert"/"status" already imply the correct aria-live politeness
      // (assertive/polite) per ARIA — nesting this in a parent aria-live
      // region would let some screen readers flatten it to the parent's
      // (weaker) politeness, so the region wrapper carries no aria-live itself.
      role={toast.variant === 'error' ? 'alert' : 'status'}
      onMouseEnter={pause}
      onMouseLeave={start}
      onFocus={pause}
      onBlur={start}
    >
      <span className={styles.msg}>{toast.message}</span>
      {toast.action ? (
        toast.action.href ? (
          <Link href={toast.action.href} className={styles.action}>
            {toast.action.label}
          </Link>
        ) : (
          <button type="button" className={styles.action} onClick={() => onDismiss(toast.id)}>
            {toast.action.label}
          </button>
        )
      ) : null}
      <button
        type="button"
        className={styles.close}
        aria-label="بستن"
        onClick={() => onDismiss(toast.id)}
      >
        ×
      </button>
    </div>
  );
}

/** Renders the UI store's toasts (aria-live region). Mounted once in AppProviders. */
export function Toaster() {
  const toasts = useUiStore((s) => s.toasts);
  const dismiss = useUiStore((s) => s.dismissToast);

  return (
    <div className={styles.region}>
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
      ))}
    </div>
  );
}

'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { useUiStore, type Toast } from '@/lib/stores/ui';
import styles from './toaster.module.css';

const AUTO_DISMISS_MS = 4000;

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(toast.id), AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [toast.id, onDismiss]);

  return (
    <div
      className={`${styles.toast} ${styles[toast.variant]}`}
      role={toast.variant === 'error' ? 'alert' : 'status'}
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
    <div className={styles.region} aria-live="polite" aria-atomic="false">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
      ))}
    </div>
  );
}

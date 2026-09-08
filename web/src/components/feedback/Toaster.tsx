'use client';
import { useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useUiStore, type Toast } from '@/lib/stores/ui';
import styles from './toaster.module.css';

const AUTO_DISMISS_MS = 4000;

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const t = useTranslations('common');
  const remaining = useRef(AUTO_DISMISS_MS);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const hovered = useRef(false);
  const focused = useRef(false);

  const start = useCallback(() => {
    if (timer.current !== undefined || hovered.current || focused.current) return;
    startedAt.current = Date.now();
    timer.current = setTimeout(() => {
      timer.current = undefined;
      onDismiss(toast.id);
    }, remaining.current);
  }, [onDismiss, toast.id]);
  const pause = () => {
    if (timer.current === undefined) return;
    clearTimeout(timer.current);
    timer.current = undefined;
    remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt.current));
  };

  useEffect(() => {
    start();
    return () => {
      clearTimeout(timer.current);
      timer.current = undefined;
    };
  }, [start]);

  return (
    <div
      className={`${styles.toast} ${styles[toast.variant]}`}
      // role="alert"/"status" already imply the correct aria-live politeness
      // (assertive/polite) per ARIA — nesting this in a parent aria-live
      // region would let some screen readers flatten it to the parent's
      // (weaker) politeness, so the region wrapper carries no aria-live itself.
      role={toast.variant === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => {
        hovered.current = true;
        pause();
      }}
      onMouseLeave={() => {
        hovered.current = false;
        start();
      }}
      onFocus={() => {
        focused.current = true;
        pause();
      }}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        focused.current = false;
        start();
      }}
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
        aria-label={t('action.close')}
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

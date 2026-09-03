'use client';
import { useState, type ReactNode } from 'react';
import {
  CheckCircleIcon,
  InfoIcon,
  WarningIcon,
  CloseIcon,
} from '@/components/primitives/icons';
import styles from './Alert.module.css';

type Tone = 'success' | 'error' | 'warning' | 'info';

const TONE_ICON = {
  success: CheckCircleIcon,
  error: WarningIcon,
  warning: WarningIcon,
  info: InfoIcon,
} as const;

/** C1 · Inline alert / banner — tinted bg + matching text + leading icon. */
export function Alert({
  tone = 'info',
  title,
  children,
  dismissible = false,
  /** Called right before the (internal, ephemeral) close — for a caller that
   *  needs the dismissal to survive a reload/navigation (e.g. CartReminder's
   *  24h suppression), not just this mount's local state. */
  onDismiss,
  className,
}: {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  dismissible?: boolean;
  onDismiss?: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  const Icon = TONE_ICON[tone];

  return (
    <div
      className={[styles.alert, styles[tone], className].filter(Boolean).join(' ')}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <span className={styles.icon} aria-hidden="true">
        <Icon size={20} />
      </span>
      <div className={styles.content}>
        {title ? <p className={styles.title}>{title}</p> : null}
        {children ? <div className={styles.body}>{children}</div> : null}
      </div>
      {dismissible ? (
        <button
          type="button"
          className={styles.close}
          aria-label="بستن"
          onClick={() => {
            onDismiss?.();
            setOpen(false);
          }}
        >
          <CloseIcon size={16} />
        </button>
      ) : null}
    </div>
  );
}

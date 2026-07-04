'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { routes } from '@/lib/routes';
import { useUiStore } from '@/lib/stores/ui';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { useFocusTrap } from '@/lib/hooks/useFocusTrap';
import { SparkIcon, CloseIcon, ArrowEndIcon } from '@/components/primitives/icons';
import styles from './ArrivalPopup.module.css';

/** Delay before the invitation appears (ms). */
const SHOW_AFTER_MS = 12_000;
/** Suppression window after a dismissal (7 days). */
const SUPPRESS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * An intent-timed announcement inviting visitors to the customer club / fresh
 * prices. It mounts nothing on the server (and until the mount effect runs), then
 * after ~12s reveals a small card pinned to the bottom-inline-start corner —
 * UNLESS the popup was dismissed within the last 7 days. Date.now() is read only
 * inside effects/handlers (never during render) so there is no hydration mismatch.
 * Accessible: role="dialog" aria-modal="true", Persian aria-label, a real
 * Tab/Shift+Tab focus trap (useFocusTrap — same as Modal.tsx), Esc to dismiss,
 * focus returns to the trigger, subtle entrance disabled under reduced-motion.
 *
 * NOTE: This component does not mount itself anywhere — the orchestrator mounts it.
 */
export function ArrivalPopup() {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const reduced = useReducedMotion();
  const dismiss = useUiStore((s) => s.dismissClubPopup);

  // Mark mounted on the client so we never render during SSR / first paint.
  useEffect(() => {
    setMounted(true);
  }, []);

  // Schedule the reveal once mounted; re-check suppression at fire time.
  useEffect(() => {
    if (!mounted) return;
    const timer = window.setTimeout(() => {
      const dismissedAt = useUiStore.getState().dismissedClubPopupAt;
      const suppressed = dismissedAt !== null && Date.now() - dismissedAt < SUPPRESS_MS;
      if (!suppressed) setVisible(true);
    }, SHOW_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [mounted]);

  const handleDismiss = () => {
    setVisible(false);
    dismiss();
  };

  // Dialog-grade focus management: moves focus to the close button on open
  // (data-autofocus), traps Tab/Shift+Tab within the popup, Esc dismisses,
  // locks background scroll, and returns focus to the trigger on close.
  const panelRef = useFocusTrap<HTMLDivElement>(visible, handleDismiss);

  if (!mounted || !visible) return null;

  return (
    <div
      ref={panelRef}
      className={`${styles.root} ${reduced ? '' : styles.animated}`}
      role="dialog"
      aria-modal="true"
      aria-label="دعوت به باشگاه مشتریان آهن‌تایم"
      tabIndex={-1}
    >
      <button
        type="button"
        className={styles.close}
        aria-label="بستن"
        data-autofocus
        onClick={handleDismiss}
      >
        <CloseIcon size={18} />
      </button>

      <div className={styles.body}>
        <span className={styles.icon} aria-hidden="true">
          <SparkIcon size={20} />
        </span>
        <div className={styles.text}>
          <p className={styles.title}>محصول‌ها و قیمت‌های تازه رسید</p>
          <p className={styles.desc}>
            به باشگاه مشتریان آهن‌تایم بپیوندید و از تخفیف پلکانی و هشدار قیمت اختصاصی بهره‌مند شوید.
          </p>
        </div>
      </div>

      <Link href={routes.club()} className={styles.cta} onClick={handleDismiss}>
        مشاهدهٔ باشگاه مشتریان
        <ArrowEndIcon size={16} aria-hidden="true" />
      </Link>
    </div>
  );
}

'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { routes } from '@/lib/routes';
import { useAnyModalOpen } from '@/lib/hooks/useFocusTrap';
import { isPromoSuppressedPath } from './arrivalPopupRoutes';
import { useUiStore } from '@/lib/stores/ui';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { AiMarkIcon, CloseIcon, ArrowEndIcon } from '@/components/primitives/icons';
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
 *
 * Deliberately NON-modal: this is a promo toast, not a dialog. The previous
 * aria-modal + focus-trap + scroll-lock version hijacked the page 12 seconds
 * into reading — a promo must never steal focus or lock scrolling. It is a
 * `status` complementary region; Esc still dismisses it, but nothing is trapped.
 *
 * It suppresses ITSELF in two ways the orchestrator can't see:
 *  - by route (`arrivalPopupRoutes`) — the funnel, login, the account area and
 *    the advisor are the visitor's task, and a promo must never outrank it. The
 *    12s timer is not even scheduled on those pages, so it can't fire on a
 *    client-side navigation into one either;
 *  - while any dialog is open (`useAnyModalOpen`) — the compare modal, the
 *    clear-cart confirm, the mobile drawer. Those are focus-trapped and
 *    scroll-locked; a promo card rendering at --z-toast on top of one is
 *    unreachable AND covers the thing that trapped focus.
 *
 * NOTE: This component does not mount itself anywhere — the orchestrator mounts it.
 */
export function ArrivalPopup() {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const reduced = useReducedMotion();
  const dismiss = useUiStore((s) => s.dismissClubPopup);
  const pathname = usePathname();
  const suppressedHere = isPromoSuppressedPath(pathname);
  const modalOpen = useAnyModalOpen();

  // Mark mounted on the client so we never render during SSR / first paint.
  useEffect(() => {
    setMounted(true);
  }, []);

  // Schedule the reveal once mounted; re-check suppression at fire time.
  useEffect(() => {
    if (!mounted || suppressedHere) return;
    const timer = window.setTimeout(() => {
      const dismissedAt = useUiStore.getState().dismissedClubPopupAt;
      const suppressed = dismissedAt !== null && Date.now() - dismissedAt < SUPPRESS_MS;
      if (!suppressed) setVisible(true);
    }, SHOW_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [mounted, suppressedHere]);

  // Already on screen when the visitor taps through to the cart / login: hide
  // it without burning the 7-day suppression window, since they never chose to
  // dismiss it.
  useEffect(() => {
    if (suppressedHere) setVisible(false);
  }, [suppressedHere]);

  const handleDismiss = () => {
    setVisible(false);
    dismiss();
  };

  // Esc dismisses (politeness), but focus is never moved or trapped.
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleDismiss();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!mounted || !visible || suppressedHere || modalOpen) return null;

  return (
    <div
      className={`${styles.root} ${reduced ? '' : styles.animated}`}
      role="status"
      aria-label="دعوت به باشگاه مشتریان آهن‌تایم"
    >
      <button
        type="button"
        className={styles.close}
        aria-label="بستن"
        onClick={handleDismiss}
      >
        <CloseIcon size={18} />
      </button>

      <div className={styles.body}>
        <span className={styles.icon} aria-hidden="true">
          <AiMarkIcon size={20} />
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

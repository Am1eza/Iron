'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { routes } from '@/lib/routes';
import { useCartStore, selectCartCount } from '@/lib/stores/cart';
import { useUiStore } from '@/lib/stores/ui';
import { isPromoSuppressedPath } from '@/components/club/arrivalPopupRoutes';
import { toPersianDigits } from '@/lib/utils/format';
import { Alert } from '@/components/ui';

/** "Actively shopping right now" vs. "added something and never came back" —
 *  a cart that changed 30 seconds ago is not abandoned, it is mid-use.
 *  Surfacing this immediately would be presumptuous, not helpful. */
const REMIND_AFTER_MS = 2 * 60 * 60 * 1000;
/** After a dismissal, wait a day before asking again — long enough not to
 *  nag every page nav within the same visit, short enough that a cart still
 *  sitting there tomorrow gets a second, reasonable nudge (unlike the club
 *  promo's 7-day window: that is unsolicited marketing, this is the
 *  visitor's own pending action). */
const SUPPRESS_MS = 24 * 60 * 60 * 1000;

/**
 * Conversion audit finding (2026-08-26): the cart persists indefinitely in
 * localStorage, but nothing EVER resurfaced it to a visitor who added items
 * and left — no banner, no reminder, the server does not even know the cart
 * exists pre-submission. A real SMS/email abandoned-cart job needs server-
 * side cart awareness, a cron job and actual marketing copy — genuine new
 * infrastructure and a business-copy decision, not something to invent
 * unilaterally. This is the fix that needed neither: the cart ALREADY
 * persists client-side, so a returning visitor can be reminded of their own
 * pending items with zero new infrastructure and zero marketing risk.
 *
 * Deliberately mounted IN-FLOW (in SiteChromeTop, not a fixed/floating
 * element) rather than joining ArrivalPopup's `--float-lane-*` choreography
 * — this is informational status about the visitor's own state, not a
 * competing floating surface, and staying in-flow sidesteps that whole
 * collision system entirely.
 */
export function CartReminder() {
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const count = useCartStore(selectCartCount);
  const lastUpdatedAt = useCartStore((s) => s.lastUpdatedAt);
  const dismissedAt = useUiStore((s) => s.dismissedCartReminderAt);
  const dismissCartReminder = useUiStore((s) => s.dismissCartReminder);

  // Mark mounted on the client so this never renders during SSR / first
  // paint — the cart store is skipHydration, so pre-hydration `count` is
  // always 0 regardless of what is really in localStorage.
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;
  if (count === 0 || lastUpdatedAt === null) return null;
  if (Date.now() - lastUpdatedAt < REMIND_AFTER_MS) return null;
  if (dismissedAt !== null && Date.now() - dismissedAt < SUPPRESS_MS) return null;
  // Same suppression list as the club promo, reused rather than duplicated —
  // both are "don't interrupt the visitor's own task" and a second
  // hand-copied list is how the two would quietly drift apart.
  if (isPromoSuppressedPath(pathname)) return null;

  return (
    <Alert tone="info" dismissible onDismiss={dismissCartReminder}>
      {toPersianDigits(count)} کالا در سبد استعلام شما منتظر است.{' '}
      <Link href={routes.cart()}>ادامهٔ سبد استعلام</Link>
    </Alert>
  );
}

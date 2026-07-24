'use client';
import Link from 'next/link';
import { routes } from '@/lib/routes';
import { useAuthStore } from '@/lib/stores/auth';
import { ArrowEndIcon } from '@/components/primitives/icons';

/**
 * Auth-aware CTA pair for the public club landing. The landing used to show a
 * static «ثبت‌نام / ورود» button to everyone — including users who were already
 * signed in (a logic bug: the primary action asked members to register). Signed
 * in → one primary «باشگاه من»; signed out → register/login + a ghost account
 * link. Class names come from the landing's own CSS module so the visual stays
 * identical.
 */
export function ClubCtas({
  wrapClass,
  primaryClass,
  ghostClass,
}: {
  wrapClass: string;
  primaryClass: string;
  ghostClass: string;
}) {
  const user = useAuthStore((s) => s.user);
  return (
    <div className={wrapClass}>
      {user ? (
        <Link href={routes.account('club')} className={primaryClass}>
          باشگاه من
          <ArrowEndIcon size={18} aria-hidden="true" />
        </Link>
      ) : (
        <>
          <Link href={routes.login(routes.club())} className={primaryClass}>
            ثبت‌نام / ورود
            <ArrowEndIcon size={18} aria-hidden="true" />
          </Link>
          <Link href={routes.account('club')} className={ghostClass}>
            حساب من
          </Link>
        </>
      )}
    </div>
  );
}

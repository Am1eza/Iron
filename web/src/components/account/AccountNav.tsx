'use client';
import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { routes } from '@/lib/routes';
import {
  HomeIcon,
  CartIcon,
  SheetIcon,
  BankIcon,
  HeartIcon,
  BellIcon,
  StarIcon,
  UserIcon,
} from '@/components/primitives/icons';
import styles from '@/app/[locale]/account/account.module.css';

const TABS = [
  { slug: '', key: 'overview', icon: HomeIcon },
  { slug: 'orders', key: 'orders', icon: CartIcon },
  { slug: 'requests', key: 'requests', icon: SheetIcon },
  { slug: 'warehouse', key: 'warehouse', icon: BankIcon },
  { slug: 'favorites', key: 'favorites', icon: HeartIcon },
  { slug: 'alerts', key: 'alerts', icon: BellIcon },
  { slug: 'club', key: 'club', icon: StarIcon },
  { slug: 'profile', key: 'profile', icon: UserIcon },
] as const;

/** Account tab nav — one component for both the desktop side rail and the
 *  mobile pill row (`variant`). Owns the tab labels/icons itself (a Client
 *  Component) since a Server Component parent cannot pass icon component
 *  references across the boundary as props. */
export function AccountNav({ slug, variant }: { slug: string; variant: 'side' | 'pills' }) {
  const t = useTranslations('account.nav');
  return (
    <nav aria-label={t('ariaLabel')} className={variant === 'side' ? styles.side : styles.nav}>
      {TABS.map((tab) => {
        const active = tab.slug === slug;
        const Icon = tab.icon;
        return (
          <Link
            key={tab.slug}
            href={tab.slug ? routes.account(tab.slug) : routes.account()}
            aria-current={active ? 'page' : undefined}
            className={
              variant === 'side'
                ? `${styles.sideItem} ${active ? styles.sideItemActive : ''}`
                : `${styles.tab} ${active ? styles.tabActive : ''}`
            }
          >
            <Icon size={variant === 'side' ? 18 : 16} aria-hidden="true" />
            {t(tab.key)}
          </Link>
        );
      })}
    </nav>
  );
}

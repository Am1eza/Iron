'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { routes } from '@/lib/routes';
import { useCartStore, selectCartCount } from '@/lib/stores/cart';
import { localizeDigits } from '@/lib/utils/format';
import type { AppLocale } from '@/i18n/config';
import { HomeIcon, TagIcon, AiMarkIcon, CartIcon, UserIcon } from '@/components/primitives/icons';
import styles from './BottomTabBar.module.css';

/**
 * N12 · Mobile bottom tab bar (≤767px). Five targets with the AI «آهن‌تایم» tab
 * centered and elevated (amber). سبد carries a Persian-digit badge when non-empty.
 */
export function BottomTabBar() {
  const pathname = usePathname();
  const cartCount = useCartStore(selectCartCount);
  const t = useTranslations('bottomTab');
  const tNav = useTranslations('nav');
  const tCommon = useTranslations('common');
  const tHeader = useTranslations('header');
  const locale = useLocale() as AppLocale;

  const isActive = (href: string) =>
    href === routes.home() ? pathname === '/' : pathname.startsWith(href);

  return (
    <nav className={styles.bar} aria-label={t('nav')} data-site-chrome>
      <Tab href={routes.home()} label={tNav('home')} active={isActive(routes.home())}>
        <HomeIcon size={22} />
      </Tab>
      <Tab href={routes.prices()} label={tNav('prices')} active={isActive(routes.prices())}>
        <TagIcon size={22} />
      </Tab>

      {/* Center, elevated AI tab */}
      <Link
        href={routes.ai()}
        className={styles.ai}
        aria-label={t('aiAria')}
        aria-current={isActive(routes.ai()) ? 'page' : undefined}
        data-event="ai_entry"
      >
        <span className={styles.aiOrb}>
          <AiMarkIcon size={24} />
        </span>
        <span className={styles.aiLabel}>{tCommon('brand')}</span>
      </Link>

      <Tab
        href={routes.cart()}
        label={t('cart')}
        active={isActive(routes.cart())}
        ariaLabel={cartCount > 0 ? tHeader('cartAriaWithCount', { count: localizeDigits(cartCount, locale) }) : tHeader('cartAria')}
      >
        <span className={styles.cartWrap}>
          <CartIcon size={22} />
          {cartCount > 0 && (
            <span className={styles.badge} aria-hidden="true">
              {localizeDigits(cartCount, locale)}
            </span>
          )}
        </span>
      </Tab>
      <Tab href={routes.account()} label={tNav('account')} active={isActive(routes.account())}>
        <UserIcon size={22} />
      </Tab>
    </nav>
  );
}

function Tab({
  href,
  label,
  active,
  ariaLabel,
  children,
}: {
  href: string;
  label: string;
  active: boolean;
  ariaLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={styles.tab}
      data-active={active ? '' : undefined}
      aria-current={active ? 'page' : undefined}
      aria-label={ariaLabel}
    >
      {children}
      <span className={styles.label}>{label}</span>
    </Link>
  );
}

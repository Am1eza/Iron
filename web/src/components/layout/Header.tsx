'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { routes } from '@/lib/routes';
import { TOOLS_NAV, SERVICES_NAV, COMPANY_NAV, SUPPORT_NAV } from '@/lib/data/nav';
import type { Category } from '@/lib/types/domain';
import { useUiStore } from '@/lib/stores/ui';
import { useAuthStore } from '@/lib/stores/auth';
import { useCartStore, selectCartCount } from '@/lib/stores/cart';
import { localizeDigits } from '@/lib/utils/format';
import type { AppLocale } from '@/i18n/config';
import { Logo } from './Logo';
import { SearchBar } from './SearchBar';
import { NavDropdown } from './NavDropdown';
import { ProductsMenu } from './ProductsMenu';
import { LocaleSwitcher } from './LocaleSwitcher';
import { MenuIcon, SearchIcon, UserIcon, CartIcon, SparkIcon } from '@/components/primitives/icons';
import styles from './Header.module.css';

/**
 * Global header. Logo · full product/tools/services/company nav (parity with the
 * footer & mobile drawer) · search · cart · account. The desktop nav uses a
 * «محصولات» mega-menu + «ابزارها/خدمات/شرکت» dropdowns; below 1024px it collapses
 * to the hamburger drawer (which mirrors the same destinations).
 */
export function Header({ categories }: { categories: Category[] }) {
  const pathname = usePathname();
  const t = useTranslations('header');
  const tNav = useTranslations('nav');
  const tCommon = useTranslations('common');
  const locale = useLocale() as AppLocale;
  const drawerOpen = useUiStore((s) => s.drawerOpen);
  const setDrawerOpen = useUiStore((s) => s.setDrawerOpen);
  const user = useAuthStore((s) => s.user);
  const cartCount = useCartStore(selectCartCount);

  const [condensed, setCondensed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchToggleRef = useRef<HTMLButtonElement | null>(null);

  // Condense purely by scroll POSITION (identical going down or up), with
  // hysteresis so the bar never flip-flops around a single threshold.
  useEffect(() => {
    let ticking = false;
    const update = () => {
      const y = window.scrollY;
      setCondensed((prev) => (prev ? y > 40 : y > 120));
      ticking = false;
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setSearchOpen(false);
  }, [pathname]);

  // Esc closes the inline search row and returns focus to its toggle —
  // consistent with every other disclosure in the app (NavDropdown, MobileDrawer).
  useEffect(() => {
    if (!searchOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSearchOpen(false);
        searchToggleRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [searchOpen]);

  const isActive = (href: string) =>
    href === routes.home() ? pathname === '/' : pathname.startsWith(href);

  return (
    <header className={styles.header} data-condensed={condensed ? '' : undefined}>
      <div className={`container ${styles.inner}`}>
        <button
          type="button"
          className={styles.menuBtn}
          aria-label={t('openMenu')}
          aria-expanded={drawerOpen}
          aria-controls="mobile-drawer-panel"
          onClick={() => setDrawerOpen(true)}
        >
          <MenuIcon size={24} />
        </button>

        <Logo compact={condensed} />

        <nav className={styles.primary} aria-label={t('mainNav')}>
          <ProductsMenu categories={categories} />

          <Link
            href={routes.prices()}
            className={styles.navLink}
            data-active={isActive(routes.prices()) ? '' : undefined}
            aria-current={isActive(routes.prices()) ? 'page' : undefined}
          >
            {tNav('prices')}
          </Link>

          <NavDropdown label={tNav('tools')} active={isActive('/tools') || isActive(routes.market())}>
            <ul className={styles.dropdownList}>
              {TOOLS_NAV.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className={styles.dropdownItem}>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </NavDropdown>

          <NavDropdown label={tNav('services')} active={isActive(routes.warehouse()) || isActive(routes.track())}>
            <ul className={styles.dropdownList}>
              {SERVICES_NAV.map((s) => (
                <li key={s.href}>
                  <Link href={s.href} className={styles.dropdownItem}>
                    {s.label}
                  </Link>
                </li>
              ))}
            </ul>
          </NavDropdown>

          <Link
            href={routes.ai()}
            className={styles.aiLink}
            data-active={isActive(routes.ai()) ? '' : undefined}
            aria-current={isActive(routes.ai()) ? 'page' : undefined}
            data-event="ai_entry"
          >
            <SparkIcon size={16} />
            {t('smartAdvisor')}
          </Link>

          <NavDropdown label={tNav('company')}>
            <ul className={styles.dropdownList}>
              {COMPANY_NAV.map((c) => (
                <li key={c.href}>
                  <Link href={c.href} className={styles.dropdownItem}>
                    {c.label}
                  </Link>
                </li>
              ))}
              <li className={styles.dropdownDivider} aria-hidden="true" />
              {SUPPORT_NAV.map((c) => (
                <li key={c.href}>
                  <Link href={c.href} className={styles.dropdownItem}>
                    {c.label}
                  </Link>
                </li>
              ))}
            </ul>
          </NavDropdown>
        </nav>

        <div className={styles.utility}>
          <button
            ref={searchToggleRef}
            type="button"
            className={styles.iconBtn}
            aria-label={t('search')}
            aria-expanded={searchOpen}
            aria-controls="header-search"
            onClick={() => setSearchOpen((v) => !v)}
          >
            <SearchIcon size={20} />
          </button>
          <Link
            href={routes.cart()}
            className={styles.iconBtn}
            aria-label={
              cartCount > 0
                ? t('cartAriaWithCount', { count: localizeDigits(cartCount, locale) })
                : t('cartAria')
            }
          >
            <span className={styles.cartWrap}>
              <CartIcon size={20} />
              {cartCount > 0 && (
                <span className={styles.cartBadge} aria-hidden="true">
                  {localizeDigits(cartCount, locale)}
                </span>
              )}
            </span>
          </Link>
          {user ? (
            <Link href={routes.account()} className={styles.accountBtn}>
              <UserIcon size={20} />
              <span className={styles.accountName}>{user.name ?? tNav('account')}</span>
            </Link>
          ) : (
            <Link href={routes.login()} className={styles.loginBtn}>
              <UserIcon size={18} />
              {tCommon('action.login')}
            </Link>
          )}
          <LocaleSwitcher />
        </div>
      </div>

      {searchOpen && (
        <div id="header-search" className={styles.searchRow}>
          <div className="container">
            <SearchBar size="lg" autoFocus />
          </div>
        </div>
      )}
    </header>
  );
}

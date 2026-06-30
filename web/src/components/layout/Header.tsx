'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { routes } from '@/lib/routes';
import { TOOLS_NAV, SERVICES_NAV, COMPANY_NAV, SUPPORT_NAV } from '@/lib/data/nav';
import type { Category } from '@/lib/types/domain';
import { useUiStore } from '@/lib/stores/ui';
import { useAuthStore } from '@/lib/stores/auth';
import { useCartStore, selectCartCount } from '@/lib/stores/cart';
import { toPersianDigits } from '@/lib/utils/format';
import { Logo } from './Logo';
import { SearchBar } from './SearchBar';
import { NavDropdown } from './NavDropdown';
import { ProductsMenu } from './ProductsMenu';
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
  const setDrawerOpen = useUiStore((s) => s.setDrawerOpen);
  const user = useAuthStore((s) => s.user);
  const cartCount = useCartStore(selectCartCount);

  const [condensed, setCondensed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setCondensed(y > 64 && y > lastY.current);
      lastY.current = y;
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setSearchOpen(false);
  }, [pathname]);

  const isActive = (href: string) =>
    href === routes.home() ? pathname === '/' : pathname.startsWith(href);

  return (
    <header className={styles.header} data-condensed={condensed ? '' : undefined}>
      <div className={`container ${styles.inner}`}>
        <button
          type="button"
          className={styles.menuBtn}
          aria-label="باز کردن منو"
          onClick={() => setDrawerOpen(true)}
        >
          <MenuIcon size={24} />
        </button>

        <Logo compact={condensed} />

        <nav className={styles.primary} aria-label="ناوبری اصلی">
          <ProductsMenu categories={categories} />

          <Link
            href={routes.prices()}
            className={styles.navLink}
            data-active={isActive(routes.prices()) ? '' : undefined}
            aria-current={isActive(routes.prices()) ? 'page' : undefined}
          >
            قیمت‌ها
          </Link>

          <NavDropdown label="ابزارها" active={isActive('/tools') || isActive(routes.market())}>
            <ul className={styles.dropdownList}>
              {TOOLS_NAV.map((t) => (
                <li key={t.href}>
                  <Link href={t.href} className={styles.dropdownItem}>
                    {t.label}
                  </Link>
                </li>
              ))}
            </ul>
          </NavDropdown>

          <NavDropdown label="خدمات" active={isActive(routes.warehouse()) || isActive(routes.track())}>
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
            مشاور هوشمند
          </Link>

          <NavDropdown label="شرکت">
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
            type="button"
            className={styles.iconBtn}
            aria-label="جستجو"
            aria-expanded={searchOpen}
            aria-controls="header-search"
            onClick={() => setSearchOpen((v) => !v)}
          >
            <SearchIcon size={20} />
          </button>
          <Link
            href={routes.cart()}
            className={styles.iconBtn}
            aria-label={cartCount > 0 ? `سبد استعلام، ${toPersianDigits(cartCount)} کالا` : 'سبد استعلام'}
          >
            <span className={styles.cartWrap}>
              <CartIcon size={20} />
              {cartCount > 0 && (
                <span className={styles.cartBadge} aria-hidden="true">
                  {toPersianDigits(cartCount)}
                </span>
              )}
            </span>
          </Link>
          {user ? (
            <Link href={routes.account()} className={styles.accountBtn}>
              <UserIcon size={20} />
              <span className={styles.accountName}>{user.name ?? 'حساب من'}</span>
            </Link>
          ) : (
            <Link href={routes.login()} className={styles.loginBtn}>
              <UserIcon size={18} />
              ورود
            </Link>
          )}
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

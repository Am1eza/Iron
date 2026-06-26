'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { routes } from '@/lib/routes';
import { PRIMARY_NAV } from '@/lib/data/nav';
import type { Category } from '@/lib/types/domain';
import { useUiStore } from '@/lib/stores/ui';
import { useAuthStore } from '@/lib/stores/auth';
import { Logo } from './Logo';
import { SearchBar } from './SearchBar';
import { MenuIcon, SearchIcon, UserIcon } from '@/components/primitives/icons';
import styles from './Header.module.css';

/**
 * Minimal global header. Logo · three essential links · search · account. No
 * mega-menus or dropdowns — browsing happens on the home rail and /prices, so the
 * bar stays calm. Transparent overlay over the home's dark hero; solidifies on scroll.
 * (`categories` kept for the mobile drawer wiring.)
 */
export function Header(_props: { categories: Category[] }) {
  const pathname = usePathname();
  const setDrawerOpen = useUiStore((s) => s.setDrawerOpen);
  const user = useAuthStore((s) => s.user);

  const [condensed, setCondensed] = useState(false);
  const [atTop, setAtTop] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setCondensed(y > 64 && y > lastY.current);
      setAtTop(y < 24);
      lastY.current = y;
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setSearchOpen(false);
  }, [pathname]);

  const overlay = pathname === '/' && atTop && !searchOpen;
  const isActive = (href: string) =>
    href === routes.home() ? pathname === '/' : pathname.startsWith(href);

  return (
    <header
      className={styles.header}
      data-condensed={condensed ? '' : undefined}
      data-overlay={overlay ? '' : undefined}
    >
      <div className={`container ${styles.inner}`}>
        <button
          type="button"
          className={styles.menuBtn}
          aria-label="باز کردن منو"
          onClick={() => setDrawerOpen(true)}
        >
          <MenuIcon size={24} />
        </button>

        <Logo compact={condensed} light={overlay} />

        <nav className={styles.primary} aria-label="ناوبری اصلی">
          {PRIMARY_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={styles.navLink}
              data-active={isActive(item.href) ? '' : undefined}
              aria-current={isActive(item.href) ? 'page' : undefined}
              data-event={item.event}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className={styles.utility}>
          <button
            type="button"
            className={styles.iconBtn}
            aria-label="جستجو"
            aria-expanded={searchOpen}
            onClick={() => setSearchOpen((v) => !v)}
          >
            <SearchIcon size={20} />
          </button>
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
        <div className={styles.searchRow}>
          <div className="container">
            <SearchBar size="lg" autoFocus />
          </div>
        </div>
      )}
    </header>
  );
}

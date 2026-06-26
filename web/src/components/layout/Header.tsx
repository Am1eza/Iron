'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { routes } from '@/lib/routes';
import { PRIMARY_NAV, TOOLS_NAV } from '@/lib/data/nav';
import type { Category } from '@/lib/types/domain';
import { useUiStore } from '@/lib/stores/ui';
import { useAuthStore } from '@/lib/stores/auth';
import { Logo } from './Logo';
import { SearchBar } from './SearchBar';
import { MegaMenu } from '@/components/lazy';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import {
  MenuIcon,
  SearchIcon,
  UserIcon,
  ChevronDownIcon,
} from '@/components/primitives/icons';
import styles from './Header.module.css';

const HOVER_INTENT_MS = 150;

/**
 * N2 · Global header / primary nav. Sticky; condenses on scroll-down past the
 * ticker and restores on scroll-up. Hosts the «محصولات» mega-menu, «ابزارها»
 * dropdown, utility nav (طلا‌و‌ارز / search / account) and the mobile menu button.
 */
export function Header({ categories }: { categories: Category[] }) {
  const pathname = usePathname();
  const setDrawerOpen = useUiStore((s) => s.setDrawerOpen);
  const user = useAuthStore((s) => s.user);

  const [condensed, setCondensed] = useState(false);
  const [atTop, setAtTop] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<'products' | 'tools' | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastY = useRef(0);

  // Sticky-condense: shrink on scroll-down, expand on scroll-up.
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

  // Transparent overlay over the home's dark cinematic hero, until you scroll.
  const overlay = pathname === '/' && atTop && openMenu === null && !searchOpen;

  // Close menus on route change.
  useEffect(() => {
    setOpenMenu(null);
    setSearchOpen(false);
  }, [pathname]);

  const isActive = (href: string) =>
    href === routes.home() ? pathname === '/' : pathname.startsWith(href);

  const openWithIntent = (menu: 'products' | 'tools') => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setOpenMenu(menu), HOVER_INTENT_MS);
  };
  const closeWithGrace = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setOpenMenu(null), HOVER_INTENT_MS);
  };

  return (
    <header
      className={styles.header}
      data-condensed={condensed ? '' : undefined}
      data-overlay={overlay ? '' : undefined}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpenMenu(null);
      }}
    >
      <div className={`container ${styles.inner}`}>
        {/* Mobile menu button (right edge in RTL) */}
        <button
          type="button"
          className={styles.menuBtn}
          aria-label="باز کردن منو"
          onClick={() => setDrawerOpen(true)}
        >
          <MenuIcon size={24} />
        </button>

        <Logo compact={condensed} light={overlay} />

        {/* Primary nav (desktop) */}
        <nav className={styles.primary} aria-label="ناوبری اصلی">
          <div
            className={styles.megaGroup}
            onMouseEnter={() => openWithIntent('products')}
            onMouseLeave={closeWithGrace}
          >
            <button
              type="button"
              className={styles.navTrigger}
              aria-expanded={openMenu === 'products'}
              aria-haspopup="true"
              data-active={isActive(routes.prices()) ? '' : undefined}
              onClick={() => setOpenMenu((m) => (m === 'products' ? null : 'products'))}
            >
              محصولات
              <ChevronDownIcon size={16} className={styles.caret} />
            </button>
            {openMenu === 'products' && (
              <MegaMenu categories={categories} onNavigate={() => setOpenMenu(null)} />
            )}
          </div>

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

          <div
            className={styles.navGroup}
            onMouseEnter={() => openWithIntent('tools')}
            onMouseLeave={closeWithGrace}
          >
            <button
              type="button"
              className={styles.navTrigger}
              aria-expanded={openMenu === 'tools'}
              aria-haspopup="true"
              onClick={() => setOpenMenu((m) => (m === 'tools' ? null : 'tools'))}
            >
              ابزارها
              <ChevronDownIcon size={16} className={styles.caret} />
            </button>
            {openMenu === 'tools' && (
              <ul className={styles.dropdown} role="menu">
                {TOOLS_NAV.map((t) => (
                  <li key={t.href} role="none">
                    <Link role="menuitem" href={t.href} className={styles.dropdownItem}>
                      {t.label}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </nav>

        {/* Utility nav (inline-end / left in RTL) */}
        <div className={styles.utility}>
          <Link href={routes.market()} className={styles.fxLink}>
            طلا و ارز
          </Link>
          <button
            type="button"
            className={styles.iconBtn}
            aria-label="جستجو"
            aria-expanded={searchOpen}
            onClick={() => setSearchOpen((v) => !v)}
          >
            <SearchIcon size={20} />
          </button>
          <span className={styles.themeToggle}>
            <ThemeToggle />
          </span>
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

      {/* Inline expanding search row */}
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

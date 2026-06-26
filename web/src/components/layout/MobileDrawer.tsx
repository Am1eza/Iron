'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { routes } from '@/lib/routes';
import { PRIMARY_NAV, TOOLS_NAV, CATEGORY_SUBS, CHANNELS } from '@/lib/data/nav';
import type { Category } from '@/lib/types/domain';
import { useUiStore } from '@/lib/stores/ui';
import { useAuthStore } from '@/lib/stores/auth';
import { CloseIcon, ChevronDownIcon, UserIcon } from '@/components/primitives/icons';
import styles from './MobileDrawer.module.css';

/**
 * N13 · Hamburger drawer — opens from the inline-start edge (right, RTL). Mirrors
 * header + footer; «محصولات» is an accordion of categories → sub-categories.
 * `role="dialog"`, focus-trapped, Esc/overlay closes, focus returns to the toggle.
 */
export function MobileDrawer({ categories }: { categories: Category[] }) {
  const open = useUiStore((s) => s.drawerOpen);
  const setOpen = useUiStore((s) => s.setDrawerOpen);
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const lastFocused = useRef<HTMLElement | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Close on route change.
  useEffect(() => {
    setOpen(false);
  }, [pathname, setOpen]);

  // Open/close side-effects: scroll lock, focus management, focus trap, Esc.
  useEffect(() => {
    if (!open) return;
    lastFocused.current = document.activeElement as HTMLElement;
    document.body.style.overflow = 'hidden';
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>('[data-autofocus]')?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const focusables = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
      lastFocused.current?.focus?.();
    };
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <div className={styles.root}>
      <div className={styles.scrim} onClick={() => setOpen(false)} aria-hidden="true" />
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label="منوی اصلی"
      >
        <div className={styles.head}>
          <span className={styles.brand}>پولادین</span>
          <button
            type="button"
            className={styles.close}
            aria-label="بستن منو"
            data-autofocus
            onClick={() => setOpen(false)}
          >
            <CloseIcon size={22} />
          </button>
        </div>

        <nav className={styles.nav} aria-label="ناوبری موبایل">
          {/* Products accordion */}
          <div className={styles.section}>
            <button
              type="button"
              className={styles.accordion}
              aria-expanded={expanded === 'products'}
              onClick={() => setExpanded((e) => (e === 'products' ? null : 'products'))}
            >
              محصولات
              <ChevronDownIcon
                size={18}
                className={expanded === 'products' ? styles.caretOpen : undefined}
              />
            </button>
            {expanded === 'products' && (
              <ul className={styles.accordionBody}>
                {categories.map((cat) => (
                  <li key={cat.id}>
                    <Link href={routes.category(cat.slug)} className={styles.catLink}>
                      {cat.name}
                    </Link>
                    <ul className={styles.subList}>
                      {(CATEGORY_SUBS[cat.slug] ?? []).map((sub) => (
                        <li key={sub.slug}>
                          <Link
                            href={routes.subCategory(cat.slug, sub.slug)}
                            className={styles.subLink}
                          >
                            {sub.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Primary links */}
          <ul className={styles.list}>
            {PRIMARY_NAV.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className={styles.item} data-event={item.event}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>

          {/* Tools */}
          <div className={styles.section}>
            <p className={styles.groupTitle}>ابزارها</p>
            <ul className={styles.list}>
              {TOOLS_NAV.map((t) => (
                <li key={t.href}>
                  <Link href={t.href} className={styles.item}>
                    {t.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Account / channels */}
          <div className={styles.foot}>
            {user ? (
              <Link href={routes.account()} className={styles.account}>
                <UserIcon size={18} />
                {user.name ?? 'حساب من'}
              </Link>
            ) : (
              <Link href={routes.login()} className={styles.account}>
                <UserIcon size={18} />
                ورود / ثبت‌نام
              </Link>
            )}
            <ul className={styles.channels} aria-label="کانال‌ها">
              {CHANNELS.map((ch) => (
                <li key={ch.href}>
                  <a href={ch.href} target="_blank" rel="noopener noreferrer">
                    {ch.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      </div>
    </div>
  );
}

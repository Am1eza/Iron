'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { routes } from '@/lib/routes';
import {
  PRIMARY_NAV,
  TOOLS_NAV,
  SERVICES_NAV_FULL,
  COMPANY_NAV,
  SUPPORT_NAV,
  CONTENT_NAV,
  CHANNELS,
} from '@/lib/data/nav';
import type { Category } from '@/lib/types/domain';
import type { SubsMap } from '@/lib/data/catalog';
import { groupSubCategories } from '@/lib/utils/catalogGroups';
import { toPersianDigits } from '@/lib/utils/format';
import { useUiStore } from '@/lib/stores/ui';
import { useAuthStore } from '@/lib/stores/auth';
import { CloseIcon, ChevronDownIcon, UserIcon } from '@/components/primitives/icons';
import styles from './MobileDrawer.module.css';

/**
 * N13 · Hamburger drawer — opens from the inline-start edge (right, RTL). Mirrors
 * header + footer; «محصولات» is an accordion of categories → sub-categories.
 * `role="dialog"`, focus-trapped, Esc/overlay closes, focus returns to the toggle.
 */
export function MobileDrawer({ categories, subs }: { categories: Category[]; subs: SubsMap }) {
  const open = useUiStore((s) => s.drawerOpen);
  const setOpen = useUiStore((s) => s.setDrawerOpen);
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const lastFocused = useRef<HTMLElement | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  // Which single category inside «محصولات» is open. One at a time, so the
  // drawer's length is ~9 rows plus one category's sub-list — not the ~80
  // chips it used to be, which put فلزات رنگی a couple of thousand pixels of
  // scrolling below the fold on the audience that is mostly on a phone.
  const [expandedCat, setExpandedCat] = useState<string | null>(null);

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
        id="mobile-drawer-panel"
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label="منوی اصلی"
      >
        <div className={styles.head}>
          <span className={styles.brand}>آهن‌تایم</span>
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
              aria-controls="mobile-drawer-products-panel"
              onClick={() => setExpanded((e) => (e === 'products' ? null : 'products'))}
            >
              محصولات
              <ChevronDownIcon
                size={18}
                className={expanded === 'products' ? styles.caretOpen : undefined}
              />
            </button>
            {expanded === 'products' && (
              <ul id="mobile-drawer-products-panel" className={styles.accordionBody}>
                {categories.map((cat) => {
                  const catSubs = subs[cat.slug] ?? [];
                  const isOpen = expandedCat === cat.slug;
                  const bodyId = `mobile-drawer-cat-${cat.slug}`;
                  return (
                    <li key={cat.id}>
                      {/* Two targets in one row, not one: the NAME goes to the
                          category's price table, the chevron opens its
                          sub-categories in place. Collapsing them into a
                          single control would force a visitor who wants
                          «همه‌ی ورق» to first expand 19 sub-categories and
                          then scroll back past them. */}
                      <div className={styles.catRow}>
                        <Link href={routes.category(cat.slug)} className={styles.catLink}>
                          {cat.name}
                          {catSubs.length > 0 && (
                            <span className={styles.catCount}>
                              {toPersianDigits(catSubs.length)}
                              <span className="visually-hidden"> زیردسته</span>
                            </span>
                          )}
                        </Link>
                        {catSubs.length > 0 && (
                          <button
                            type="button"
                            className={styles.catToggle}
                            aria-expanded={isOpen}
                            aria-controls={bodyId}
                            aria-label={`زیردسته‌های ${cat.name}`}
                            onClick={() => setExpandedCat((s) => (s === cat.slug ? null : cat.slug))}
                          >
                            <ChevronDownIcon size={18} className={isOpen ? styles.caretOpen : undefined} />
                          </button>
                        )}
                      </div>

                      {isOpen && (
                        <ul id={bodyId} className={styles.subList}>
                          {groupSubCategories(catSubs).map((group) => (
                            <li
                              key={group.label ?? `_solo_${(group.lead ?? group.items[0])!.slug}`}
                              className={styles.subGroup}
                            >
                              {/* Same rule as the desktop menu: a group named
                                  after one of its own members is headed by
                                  that member as a link, so «چهارپهلو» stops
                                  rendering as a dead caption above an
                                  identical «چهارپهلو» chip. */}
                              {group.lead ? (
                                <Link
                                  href={routes.subCategory(cat.slug, group.lead.slug)}
                                  className={`${styles.subLink} ${styles.subLead}`}
                                >
                                  {group.lead.name}
                                </Link>
                              ) : group.label ? (
                                <p className={styles.subGroupHeading}>{group.label}</p>
                              ) : null}
                              <ul className={group.label ? styles.subNested : styles.subFlat}>
                                {group.items.map((sub) => (
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
                    </li>
                  );
                })}
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

          {/* Services / Company / Support — same sets as the header & footer */}
          {[
            // Content first: on mobile the drawer is the ONLY path to an
            // article — the bottom tab bar is full and correctly prioritises
            // prices, the AI advisor and the cart.
            { title: 'مقالات', links: CONTENT_NAV },
            { title: 'خدمات', links: SERVICES_NAV_FULL },
            { title: 'شرکت', links: COMPANY_NAV },
            { title: 'پشتیبانی', links: SUPPORT_NAV },
          ].map((group) => (
            <div key={group.title} className={styles.section}>
              <p className={styles.groupTitle}>{group.title}</p>
              <ul className={styles.list}>
                {group.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className={styles.item}>
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

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
                    <span className="visually-hidden"> (در تب جدید باز می‌شود)</span>
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

'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './admin.module.css';

export function AdminNavLinks({ nav }: { nav: Array<{ href: string; label: string }> }) {
  const pathname = usePathname();
  return (
    <>
      {nav.map((item) => {
        // The dashboard link is the "/admin" root — only exact-match it,
        // otherwise every nested admin page would also light it up.
        const active =
          item.href === '/admin'
            ? pathname === '/admin'
            : pathname === item.href || (pathname?.startsWith(`${item.href}/`) ?? false);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={styles.navLink}
            aria-current={active ? 'page' : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

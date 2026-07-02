import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission } from '@/lib/auth/guards';
import { routes } from '@/lib/routes';
import styles from './admin.module.css';

/** Admin shell — noindex; server-gated on admin:access (404 for non-staff). */
export const metadata: Metadata = { robots: { index: false, follow: false } };

const NAV = [
  { href: routes.admin.dashboard(), label: 'داشبورد' },
  { href: routes.admin.pricing(), label: 'قیمت‌گذاری' },
  { href: routes.admin.leads(), label: 'سرنخ‌ها' },
  { href: routes.admin.orders(), label: 'سفارش‌ها' },
  { href: routes.admin.warehouse(), label: 'انبار' },
  { href: routes.admin.content(), label: 'محتوا' },
  { href: routes.admin.catalog(), label: 'کاتالوگ' },
  { href: routes.admin.users(), label: 'کاربران' },
  { href: routes.admin.settings(), label: 'تنظیمات' },
  { href: routes.admin.audit(), label: 'رویدادها' },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePermission('admin:access', routes.admin.dashboard());

  return (
    <div data-area="admin" className={styles.shell}>
      <header className={styles.topbar}>
        <Link href={routes.admin.dashboard()} className={styles.brand}>
          پنل آهن‌تایم
        </Link>
        <nav className={styles.nav} aria-label="پنل مدیریت">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className={styles.navLink}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className={styles.user}>
          <span>{user.name ?? user.mobile}</span>
          <Link href={routes.home()} className={styles.exit}>
            خروج به سایت
          </Link>
        </div>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}

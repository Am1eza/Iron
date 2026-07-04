import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission } from '@/lib/auth/guards';
import { can } from '@/lib/auth/roles';
import type { Permission } from '@/lib/auth/types';
import { routes } from '@/lib/routes';
import { AdminNavLinks } from './AdminNavLinks';
import styles from './admin.module.css';

/** Admin shell — noindex; server-gated on admin:access (404 for non-staff). */
export const metadata: Metadata = { robots: { index: false, follow: false } };

const NAV: Array<{ href: string; label: string; permission?: Permission }> = [
  { href: routes.admin.dashboard(), label: 'داشبورد' },
  { href: routes.admin.pricing(), label: 'قیمت‌گذاری', permission: 'pricing:write' },
  { href: routes.admin.leads(), label: 'سرنخ‌ها', permission: 'leads:read' },
  { href: routes.admin.orders(), label: 'سفارش‌ها', permission: 'leads:read' },
  { href: routes.admin.warehouse(), label: 'انبار', permission: 'leads:read' },
  { href: routes.admin.content(), label: 'محتوا', permission: 'content:write' },
  { href: routes.admin.catalog(), label: 'کاتالوگ', permission: 'catalog:read' },
  { href: routes.admin.users(), label: 'کاربران', permission: 'users:manage' },
  { href: routes.admin.settings(), label: 'تنظیمات', permission: 'settings:write' },
  { href: routes.admin.audit(), label: 'رویدادها', permission: 'audit:read' },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePermission('admin:access', routes.admin.dashboard());
  const nav = NAV.filter((item) => !item.permission || can(user.role, item.permission));

  return (
    <div data-area="admin" className={styles.shell}>
      <a href="#admin-main" className="skip-link">
        پرش به محتوای پنل
      </a>
      <header className={styles.topbar}>
        <Link href={routes.admin.dashboard()} className={styles.brand}>
          پنل آهن‌تایم
        </Link>
        <nav className={styles.nav} aria-label="پنل مدیریت">
          <AdminNavLinks nav={nav} />
        </nav>
        <div className={styles.user}>
          <span>{user.name ?? user.mobile}</span>
          <Link href={routes.home()} className={styles.exit}>
            خروج به سایت
          </Link>
        </div>
      </header>
      {/* Not a <main> — the root layout's <main id="main"> is the page's only
          main landmark; SiteChrome hides the public header/footer/nav here,
          so this is simply the admin panel's content area. */}
      <div id="admin-main" className={styles.main}>
        {children}
      </div>
    </div>
  );
}

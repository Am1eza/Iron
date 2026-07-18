import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { requirePermission } from '@/lib/auth/guards';
import { can, permissionForAdminPath } from '@/lib/auth/roles';
import { routes } from '@/lib/routes';
import { AdminNavLinks } from './AdminNavLinks';
import { AdminAlerts } from '@/components/admin/AdminAlerts';
import { CommandPalette } from '@/components/admin/CommandPalette';
import styles from './admin.module.css';
import logoMark from '../../../public/brand/ahantime-logo.png';

/** Admin shell — noindex; server-gated on admin:access (404 for non-staff). */
export const metadata: Metadata = { robots: { index: false, follow: false } };

// Permissions come from the shared ADMIN_PATH_PERMISSIONS map (roles.ts) so
// the nav filter, middleware.ts's edge gate, and each page's own
// requirePermission() call can never drift apart.
const NAV: Array<{ href: string; label: string }> = [
  { href: routes.admin.dashboard(), label: 'داشبورد' },
  { href: routes.admin.desk(), label: 'میز کار من' },
  { href: routes.admin.marketing(), label: 'بازاریابی' },
  { href: routes.admin.seo(), label: 'سئو' },
  { href: routes.admin.pricing(), label: 'قیمت‌گذاری' },
  { href: routes.admin.alerts(), label: 'هشدارهای قیمت' },
  { href: routes.admin.leads(), label: 'سرنخ‌ها' },
  { href: routes.admin.orders(), label: 'سفارش‌ها' },
  { href: routes.admin.warehouse(), label: 'انبار' },
  { href: routes.admin.content(), label: 'محتوا' },
  { href: routes.admin.catalog(), label: 'کاتالوگ' },
  { href: routes.admin.users(), label: 'کاربران' },
  { href: routes.admin.settings(), label: 'تنظیمات' },
  { href: routes.admin.audit(), label: 'رویدادها' },
  { href: routes.admin.ai(), label: 'دستیار هوشمند' },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePermission('admin:access', routes.admin.dashboard());
  const nav = NAV.filter((item) => {
    const permission = permissionForAdminPath(item.href);
    return !permission || can(user.role, permission);
  });

  return (
    <div data-area="admin" className={styles.shell}>
      <a href="#admin-main" className="skip-link">
        پرش به محتوای پنل
      </a>
      <header className={styles.topbar}>
        <Link href={routes.admin.dashboard()} className={styles.brand}>
          <Image src={logoMark} alt="" className={styles.brandMark} priority />
          پنل مدیریت
        </Link>
        <nav className={styles.nav} aria-label="پنل مدیریت">
          <AdminNavLinks nav={nav} />
      <AdminAlerts />
        </nav>
        <div className={styles.user}>
          <CommandPalette nav={nav} />
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

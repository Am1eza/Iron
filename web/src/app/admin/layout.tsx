import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { requirePermission } from '@/lib/auth/guards';
import { can, permissionForAdminPath } from '@/lib/auth/roles';
import { routes } from '@/lib/routes';
import { AdminNavLinks } from './AdminNavLinks';
import { AdminAlerts } from '@/components/admin/AdminAlerts';
import { CommandPalette } from '@/components/admin/CommandPalette';
import { LogoutButton } from '@/components/auth/LogoutButton';
import styles from './admin.module.css';
import logoMark from '../../../public/brand/ahantime-logo.png';

/** Admin shell — noindex; server-gated on admin:access (404 for non-staff). */
export const metadata: Metadata = { robots: { index: false, follow: false } };

// Permissions come from the shared ADMIN_PATH_PERMISSIONS map (roles.ts) so
// the nav filter, middleware.ts's edge gate, and each page's own
// requirePermission() call can never drift apart.
//
// Grouped by job (dashboard-IA research: 15 flat links don't scan; grouping +
// pending-work badges turn the nav into an ops surface). The «سرنخ‌ها» badge
// carries newLeads+newMessages+openRequests from the live stats poll.
const NAV_GROUPS: Array<{
  title: string | null;
  items: Array<{ href: string; label: string; badge?: 'inbound' }>;
}> = [
  {
    title: null,
    items: [
      { href: routes.admin.dashboard(), label: 'داشبورد' },
      { href: routes.admin.desk(), label: 'میز کار من' },
    ],
  },
  {
    title: 'فروش',
    items: [
      { href: routes.admin.leads(), label: 'سرنخ‌ها', badge: 'inbound' },
      { href: routes.admin.orders(), label: 'سفارش‌ها' },
      { href: routes.admin.warehouse(), label: 'انبار' },
      { href: routes.admin.alerts(), label: 'هشدارهای قیمت' },
    ],
  },
  {
    title: 'سایت',
    items: [
      { href: routes.admin.pricing(), label: 'قیمت‌گذاری' },
      { href: routes.admin.catalog(), label: 'کاتالوگ' },
      { href: routes.admin.content(), label: 'محتوا' },
      { href: routes.admin.seo(), label: 'سئو' },
      { href: routes.admin.marketing(), label: 'بازاریابی' },
      { href: routes.admin.ai(), label: 'دستیار هوشمند' },
    ],
  },
  {
    title: 'سیستم',
    items: [
      { href: routes.admin.users(), label: 'کاربران' },
      { href: routes.admin.settings(), label: 'تنظیمات' },
      { href: routes.admin.audit(), label: 'رویدادها' },
      { href: routes.admin.help(), label: 'راهنما' },
    ],
  },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePermission('admin:access', routes.admin.dashboard());
  const groups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((item) => {
      const permission = permissionForAdminPath(item.href);
      return !permission || can(user.role, permission);
    }),
  })).filter((g) => g.items.length > 0);
  const flatNav = groups.flatMap((g) => g.items);

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
        {/* Mobile/tablet: one horizontally-scrollable strip (never a wall of
            wrapped links). Desktop hides this and shows the sidebar instead. */}
        <nav className={styles.nav} aria-label="پنل مدیریت">
          <AdminNavLinks groups={groups} variant="strip" />
        </nav>
        <div className={styles.user}>
          <CommandPalette nav={flatNav} />
          <span className={styles.userName}>{user.name ?? user.mobile}</span>
          <Link href={routes.home()} className={styles.exit}>
            سایت
          </Link>
          <LogoutButton redirectTo={routes.home()} />
        </div>
      </header>
      {/* Inbound-alert poller (sound + desktop notification) — a headless
          utility, deliberately OUTSIDE the nav landmark. */}
      <AdminAlerts />
      <div className={styles.body}>
        <aside className={styles.sidebar}>
          <nav aria-label="بخش‌های پنل" className={styles.sideNav}>
            <AdminNavLinks groups={groups} variant="side" />
          </nav>
        </aside>
        {/* Not a <main> — the root layout's <main id="main"> is the page's only
            main landmark; SiteChrome hides the public header/footer/nav here,
            so this is simply the admin panel's content area. */}
        <div id="admin-main" className={styles.main}>
          {children}
        </div>
      </div>
    </div>
  );
}

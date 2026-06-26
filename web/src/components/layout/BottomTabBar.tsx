'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { routes } from '@/lib/routes';
import { useCartStore, selectCartCount } from '@/lib/stores/cart';
import { toPersianDigits } from '@/lib/utils/format';
import { HomeIcon, TagIcon, SparkIcon, CartIcon, UserIcon } from '@/components/primitives/icons';
import styles from './BottomTabBar.module.css';

/**
 * N12 · Mobile bottom tab bar (≤767px). Five targets with the AI «آهن‌تایم» tab
 * centered and elevated (amber). سبد carries a Persian-digit badge when non-empty.
 */
export function BottomTabBar() {
  const pathname = usePathname();
  const cartCount = useCartStore(selectCartCount);

  const isActive = (href: string) =>
    href === routes.home() ? pathname === '/' : pathname.startsWith(href);

  return (
    <nav className={styles.bar} aria-label="ناوبری پایین">
      <Tab href={routes.home()} label="خانه" active={isActive(routes.home())}>
        <HomeIcon size={22} />
      </Tab>
      <Tab href={routes.prices()} label="قیمت‌ها" active={isActive(routes.prices())}>
        <TagIcon size={22} />
      </Tab>

      {/* Center, elevated AI tab */}
      <Link
        href={routes.ai()}
        className={styles.ai}
        aria-label="آهن‌تایم — مشاور هوشمند"
        aria-current={isActive(routes.ai()) ? 'page' : undefined}
        data-event="ai_entry"
      >
        <span className={styles.aiOrb}>
          <SparkIcon size={24} />
        </span>
        <span className={styles.aiLabel}>آهن‌تایم</span>
      </Link>

      <Tab href={routes.cart()} label="سبد" active={isActive(routes.cart())}>
        <span className={styles.cartWrap}>
          <CartIcon size={22} />
          {cartCount > 0 && (
            <span className={styles.badge} aria-hidden="true">
              {toPersianDigits(cartCount)}
            </span>
          )}
        </span>
      </Tab>
      <Tab href={routes.account()} label="حساب" active={isActive(routes.account())}>
        <UserIcon size={22} />
      </Tab>
    </nav>
  );
}

function Tab({
  href,
  label,
  active,
  children,
}: {
  href: string;
  label: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={styles.tab}
      data-active={active ? '' : undefined}
      aria-current={active ? 'page' : undefined}
    >
      {children}
      <span className={styles.label}>{label}</span>
    </Link>
  );
}

'use client';
import { usePathname } from 'next/navigation';
import { Ticker } from './Ticker';
import { Header } from './Header';
import { MobileDrawer } from './MobileDrawer';
import { Footer } from './Footer';
import { BottomTabBar } from './BottomTabBar';
import { ArrivalPopup } from '@/components/club/ArrivalPopup';
import type { Category } from '@/lib/types/domain';

/**
 * The public storefront chrome — hidden on `/admin/*`, which has its own
 * dedicated shell (`app/admin/layout.tsx`). Without this gate the admin panel
 * rendered a second, nested `<main>` landmark plus the customer nav/cart/AI
 * tab bar stacked around every admin page (WCAG 1.3.1/4.1.2). Split into
 * top/bottom halves so the root layout's single `<main>` stays between them
 * in DOM order.
 */
export function SiteChromeTop({ categories }: { categories: Category[] }) {
  const pathname = usePathname();
  if (pathname?.startsWith('/admin')) return null;
  return (
    <>
      <Ticker />
      <Header categories={categories} />
      <MobileDrawer categories={categories} />
    </>
  );
}

export function SiteChromeBottom({ categories }: { categories: Category[] }) {
  const pathname = usePathname();
  if (pathname?.startsWith('/admin')) return null;
  return (
    <>
      <Footer categories={categories} />
      <BottomTabBar />
      <ArrivalPopup />
    </>
  );
}

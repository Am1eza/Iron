'use client';
import { usePathname } from 'next/navigation';
import { Ticker } from './Ticker';
import { Header } from './Header';
import { Footer } from './Footer';
import { BottomTabBar } from './BottomTabBar';
// Code-split: the hamburger drawer is only reachable below the 1024px
// breakpoint (and only once opened), and the arrival popup renders `null`
// for its own first 12s by design — neither needs to ship in the shared
// bundle every visitor downloads (see components/lazy.ts).
import { MobileDrawer, ArrivalPopup } from '@/components/lazy';
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

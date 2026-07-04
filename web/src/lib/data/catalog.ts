/**
 * Server-side catalog helpers — used by Server Components (layout chrome, home).
 * Wraps the API client so mock⇄live switches transparently. The list of 7
 * categories drives the rail, mega-menu, footer and home grid (IA §1).
 */
import { cache } from 'react';
import type { Category } from '@/lib/types/domain';
import { getCategories as serverCategories } from '@/lib/server/catalog';

/**
 * The 7 product categories in taxonomy order, active only. Wrapped in React's
 * `cache()` so the root layout (nav/footer chrome) and a page rendered inside it
 * (e.g. home, /prices) share one DB read per request instead of two.
 */
export const getCategories = cache(async (): Promise<Category[]> => {
  try {
    const categories = await serverCategories();
    return categories.filter((c) => c.isActive).sort((a, b) => a.order - b.order);
  } catch {
    // Chrome must never hard-fail; an empty rail degrades gracefully.
    return [];
  }
});

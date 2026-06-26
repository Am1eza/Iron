/**
 * Server-side catalog helpers — used by Server Components (layout chrome, home).
 * Wraps the API client so mock⇄live switches transparently. The list of 7
 * categories drives the rail, mega-menu, footer and home grid (IA §1).
 */
import { api } from '@/lib/api';
import type { Category } from '@/lib/types/domain';

/** The 7 product categories in taxonomy order, active only. */
export async function getCategories(): Promise<Category[]> {
  try {
    const { categories } = await api.catalog.categories();
    return categories.filter((c) => c.isActive).sort((a, b) => a.order - b.order);
  } catch {
    // Chrome must never hard-fail; an empty rail degrades gracefully.
    return [];
  }
}

/**
 * Matomo event tracking — the bridge between "someone did something valuable"
 * and the conversion goals configured in Matomo (site 1).
 *
 * The goals match on EVENT CATEGORY, exactly:
 *   'lead'    → «درخواست قیمت / استعلام»
 *   'ai-chat' → «شروع گفتگو با مشاور هوشمند»
 *   'contact' → «تماس با ما»
 * Changing a category string here silently stops that goal converting, so the
 * union below is the contract — keep it in sync with Matomo, not with taste.
 *
 * Everything is a no-op when the tracker isn't loaded (MATOMO_SITE_ID unset,
 * an ad-blocker, SSR), so call sites never need to guard.
 */
export type GoalCategory = 'lead' | 'ai-chat' | 'contact';

declare global {
  interface Window {
    _paq?: unknown[][];
  }
}

/**
 * Record a conversion-worthy action. `action` is free-form (the sub-type of
 * the event, e.g. which form), `name` an optional label (e.g. the category the
 * enquiry was about) — both show up in Matomo's Events report.
 */
export function trackGoal(category: GoalCategory, action: string, name?: string): void {
  if (typeof window === 'undefined' || !Array.isArray(window._paq)) return;
  try {
    window._paq.push(name ? ['trackEvent', category, action, name] : ['trackEvent', category, action]);
  } catch {
    // Analytics must never break a real user flow — a failed push is nothing.
  }
}

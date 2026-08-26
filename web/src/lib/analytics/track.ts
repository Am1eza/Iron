/**
 * Conversion-event tracking — the bridge between "someone did something
 * valuable" and the conversion goals configured in Matomo (site 1) AND,
 * when GTM_ID/GA4_ID are set (see components/analytics/Analytics.tsx), the
 * key events configured in GA4. Same call sites feed both — every consumer
 * below calls `trackGoal` once; this file fans it out.
 *
 * The Matomo goals match on EVENT CATEGORY, exactly:
 *   'lead'    → «درخواست قیمت / استعلام»
 *   'ai-chat' → «شروع گفتگو با مشاور هوشمند»
 *   'contact' → «تماس با ما»
 * Changing a category string breaks that goal silently, so the union below
 * is the contract — keep it in sync with Matomo (and, once created, GA4's
 * matching key events), not with taste.
 *
 * GA4 event names, pushed to `dataLayer` for GTM to pick up:
 *   'lead'    → generate_lead   (GA4's own recommended name for this)
 *   'ai-chat' → chat_start      (custom — GA4 has no standard equivalent)
 *   'contact' → contact_form_submit (custom)
 * `action`/`name` ride along as event params (`lead_type`/`lead_detail`) so
 * they're visible in GA4's event-parameter reports without a second event
 * per form. Mark `generate_lead` (and the other two, if wanted) as a GA4
 * "Key event" in the property's Admin → Events UI once the property exists —
 * that step lives in Google's UI, not in this repo.
 *
 * Everything is a no-op when the relevant tracker isn't loaded (MATOMO_SITE_ID
 * / GTM_ID / GA4_ID unset, an ad-blocker, SSR), so call sites never need to
 * guard, and a failure in one tracker can never take out the other.
 */
export type GoalCategory = 'lead' | 'ai-chat' | 'contact';

const GA4_EVENT_NAME: Record<GoalCategory, string> = {
  lead: 'generate_lead',
  'ai-chat': 'chat_start',
  contact: 'contact_form_submit',
};

declare global {
  interface Window {
    _paq?: unknown[][];
    dataLayer?: unknown[];
  }
}

/**
 * Record a conversion-worthy action. `action` is free-form (the sub-type of
 * the event, e.g. which form), `name` an optional label (e.g. the category the
 * enquiry was about) — both show up in Matomo's Events report and as GA4
 * event parameters.
 */
export function trackGoal(category: GoalCategory, action: string, name?: string): void {
  if (typeof window === 'undefined') return;
  if (Array.isArray(window._paq)) {
    try {
      window._paq.push(name ? ['trackEvent', category, action, name] : ['trackEvent', category, action]);
    } catch {
      // Analytics must never break a real user flow — a failed push is nothing.
    }
  }
  if (Array.isArray(window.dataLayer)) {
    try {
      window.dataLayer.push({
        event: GA4_EVENT_NAME[category],
        lead_type: action,
        ...(name ? { lead_detail: name } : {}),
      });
    } catch {
      // Same rule as above — never break the real user flow over analytics.
    }
  }
}

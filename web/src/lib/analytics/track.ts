/**
 * Conversion-event tracking — the bridge between "someone did something
 * valuable" and the conversion goals configured in Matomo (site 1) AND,
 * when GTM_ID/GA4_ID are set (see components/analytics/Analytics.tsx), the
 * key events configured in GA4. Same call sites feed both — every consumer
 * below calls `trackGoal` once; this file fans it out.
 *
 * The Matomo goals match on EVENT CATEGORY, exactly:
 *   'lead'         → «درخواست قیمت / استعلام»
 *   'ai-chat'      → «شروع گفتگو با مشاور هوشمند»
 *   'contact'      → «تماس با ما»
 *   'view-product' → (no Matomo Goal yet — still logs as a plain Event under
 *                     Behaviour → Events, usable for funnel analysis without one)
 *   'add-to-cart'  → (same — Event only, no Goal yet)
 * Changing a category string breaks that goal silently, so the union below
 * is the contract — keep it in sync with Matomo (and, once created, GA4's
 * matching key events), not with taste.
 *
 * GA4 event names, pushed to `dataLayer` for GTM to pick up:
 *   'lead'         → generate_lead   (GA4's own recommended name for this)
 *   'ai-chat'      → chat_start      (custom — GA4 has no standard equivalent)
 *   'contact'      → contact_form_submit (custom)
 *   'view-product' → view_item       (GA4's own recommended ecommerce event name)
 *   'add-to-cart'  → add_to_cart     (same)
 * `action`/`name` ride along as event params (`lead_type`/`lead_detail`) so
 * they're visible in GA4's event-parameter reports without a second event
 * per form. Mark `generate_lead` (and the other two, if wanted) as a GA4
 * "Key event" in the property's Admin → Events UI once the property exists —
 * that step lives in Google's UI, not in this repo. `view-product`/
 * `add-to-cart` fill a real, previously-open gap (conversion audit finding,
 * 2026-08-26): every OTHER call site tracks the final submit, but nothing
 * upstream did, so there was no way to see where in the funnel a visitor
 * actually dropped off — only that the ones who reached the end, reached it.
 * The GTM/GA4 side of these two still needs a trigger configured in Tag
 * Manager's own UI (same class of external, owner-only step as the other
 * three) before they show up as GA4 events; Matomo picks them up immediately
 * with no extra setup, since Matomo logs any tracked event without
 * pre-declaring it as a Goal first.
 *
 * Everything is a no-op when the relevant tracker isn't loaded (MATOMO_SITE_ID
 * / GTM_ID / GA4_ID unset, an ad-blocker, SSR), so call sites never need to
 * guard, and a failure in one tracker can never take out the other.
 */
export type GoalCategory =
  | 'lead'
  | 'ai-chat'
  | 'contact'
  | 'view-product'
  | 'add-to-cart'
  | 'navigation'
  | 'club'
  | 'alert'
  | 'funnel';

/** Category+action pairs that deserve their own GA4 event name. */
const GA4_EVENT_OVERRIDE: Record<string, string> = {
  'contact:phone-click': 'phone_click',
  'contact:whatsapp-click': 'whatsapp_click',
};

const GA4_EVENT_NAME: Record<GoalCategory, string> = {
  lead: 'generate_lead',
  'ai-chat': 'chat_start',
  contact: 'contact_form_submit',
  'view-product': 'view_item',
  'add-to-cart': 'add_to_cart',
  navigation: 'navigation_select',
  club: 'club_join',
  alert: 'alert_set',
  funnel: 'funnel_step',
};

declare global {
  interface Window {
    _paq?: unknown[][];
    dataLayer?: unknown[];
    /** Defined by the loader in components/analytics/Analytics.tsx before GTM
     *  itself loads, so a call made during the first seconds of a visit is
     *  queued rather than dropped. */
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * Record a conversion-worthy action. `action` is free-form (the sub-type of
 * the event, e.g. which form), `name` an optional label (e.g. the category the
 * enquiry was about) — both show up in Matomo's Events report and as GA4
 * event parameters.
 */
/**
 * Identify the signed-in visitor to GA4 (and nothing else) by their opaque
 * internal id — never a mobile number, name or email. Without it GA4 counted
 * the same buyer as a new user on every device, and no funnel could be
 * followed from an anonymous price view through to the proforma request the
 * panel eventually sees. Pushed as its own event so the Google tag can pick
 * it up as a user property/user_id in Tag Manager.
 */
export function identifyUser(userId: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    // `set` (not an event): applies to every subsequent hit in the session,
    // which is what GA4's reporting identity needs to stitch a signed-in
    // buyer's visits together.
    window.gtag?.('set', { user_id: userId ?? undefined });
  } catch {
    // Analytics must never break a real user flow.
  }
}

export function trackGoal(category: GoalCategory, action: string, name?: string): void {
  if (typeof window === 'undefined') return;
  // A club invitation is earned by intent, never by elapsed time. Keep the
  // eligibility through the auth/request redirect and let ArrivalPopup show
  // it on the next non-suppressed page.
  if (category === 'lead' || category === 'alert') {
    try {
      window.sessionStorage.setItem('ahantime_club_invite_eligible', '1');
      window.dispatchEvent(new CustomEvent('ahantime:club-invite-eligible'));
    } catch {
      // Storage/privacy restrictions must never affect the completed action.
    }
  }
  if (Array.isArray(window._paq)) {
    try {
      window._paq.push(name ? ['trackEvent', category, action, name] : ['trackEvent', category, action]);
    } catch {
      // Analytics must never break a real user flow — a failed push is nothing.
    }
  }
  // GA4 via `gtag('event', …)`, NOT a bare `dataLayer.push({event})`.
  //
  // The published GTM container has exactly three custom-event triggers
  // (generate_lead, chat_start, contact_form_submit), so six of the nine
  // events this function can raise — view_item, add_to_cart, alert_set,
  // club_join, funnel_step, navigation_select — were pushed into the
  // dataLayer and matched nothing: the whole middle of the funnel was
  // invisible in GA4 while looking instrumented in the code. Those three
  // tags also forwarded no parameters, so `lead_type`/`lead_detail` never
  // arrived either.
  //
  // A `gtag('event')` call is delivered by the Google tag itself, with its
  // parameters, without a per-event tag in the container — so the funnel is
  // complete from the code alone and cannot silently lose an event again the
  // next time one is added here. (It also cannot double-count: GTM's custom
  // event triggers match a pushed `event` STRING, and the gtag queue pushes
  // an arguments object instead.)
  try {
    window.gtag?.('event', GA4_EVENT_OVERRIDE[`${category}:${action}`] ?? GA4_EVENT_NAME[category], {
      lead_type: action,
      ...(name ? { lead_detail: name } : {}),
    });
  } catch {
    // Same rule as above — never break the real user flow over analytics.
  }
}

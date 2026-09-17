import { describe, it, expect, beforeEach } from 'vitest';
import { identifyUser, trackGoal } from './track';

/** The gtag command queue the loader installs (Analytics.tsx) — GA4 events
 *  are delivered through it, not through a bare `dataLayer.push({event})`. */
let calls: unknown[][] = [];
const sent = () =>
  calls.filter(([cmd]) => cmd === 'event').map(([, name, params]) => [name, params]) as Array<
    [string, Record<string, unknown>]
  >;

describe('trackGoal', () => {
  beforeEach(() => {
    delete window.dataLayer;
    delete window._paq;
    calls = [];
    window.gtag = (...args: unknown[]) => {
      calls.push(args);
    };
    window.sessionStorage.clear();
  });

  it('is a no-op when neither tracker is loaded', () => {
    delete window.gtag;
    expect(() => trackGoal('lead', 'cart-proforma')).not.toThrow();
  });

  it('pushes to Matomo when _paq exists', () => {
    window._paq = [];
    trackGoal('lead', 'cart-proforma', '۲ قلم');
    expect(window._paq).toEqual([['trackEvent', 'lead', 'cart-proforma', '۲ قلم']]);
  });

  it('sends the matching GA4 event with its parameters through gtag', () => {
    trackGoal('lead', 'cart-proforma', '۲ قلم');
    expect(sent()).toEqual([['generate_lead', { lead_type: 'cart-proforma', lead_detail: '۲ قلم' }]]);
    expect(window._paq).toBeUndefined();
  });

  it('never pushes a bare {event} object — that is what GTM triggers match, and would double-count', () => {
    window.dataLayer = [];
    trackGoal('lead', 'cart-proforma');
    expect(window.dataLayer).toEqual([]);
  });

  it('omits lead_detail when no name is given', () => {
    window.dataLayer = [];
    trackGoal('contact', 'contact-form');
    expect(sent()).toEqual([['contact_form_submit', { lead_type: 'contact-form' }]]);
  });

  it('maps each category to its own GA4 event name', () => {
    window.dataLayer = [];
    trackGoal('ai-chat', 'first-message', 'general');
    expect(sent()).toEqual([['chat_start', { lead_type: 'first-message', lead_detail: 'general' }]]);
  });

  it('fires both trackers independently when both are loaded', () => {
    window._paq = [];
    window.dataLayer = [];
    trackGoal('lead', 'tender-estimate', '۳ قلم');
    expect(window._paq).toHaveLength(1);
    expect(sent()).toHaveLength(1);
  });

  it('marks club invitation eligibility only after a lead or alert', () => {
    trackGoal('navigation', 'search_use');
    expect(window.sessionStorage.getItem('ahantime_club_invite_eligible')).toBeNull();
    trackGoal('alert', 'alert_set');
    expect(window.sessionStorage.getItem('ahantime_club_invite_eligible')).toBe('1');
  });

  it('gives a phone or WhatsApp hand-off its own GA4 event, not contact_form_submit', () => {
    window.dataLayer = [];
    window._paq = [];
    trackGoal('contact', 'phone-click', '/prices/rebar');
    trackGoal('contact', 'whatsapp-click', '/prices/rebar');
    expect(sent().map(([name]) => name)).toEqual(['phone_click', 'whatsapp_click']);
    // Matomo's own category/action pair is unchanged — its goals match on it.
    expect(window._paq).toEqual([
      ['trackEvent', 'contact', 'phone-click', '/prices/rebar'],
      ['trackEvent', 'contact', 'whatsapp-click', '/prices/rebar'],
    ]);
  });

  it('identifies a signed-in user by opaque id, and clears it when signed out', () => {
    identifyUser('01M0DYE97A0000V09EZBJQ7CAP');
    identifyUser(null);
    expect(calls.filter(([cmd]) => cmd === 'set')).toEqual([
      ['set', { user_id: '01M0DYE97A0000V09EZBJQ7CAP' }],
      ['set', { user_id: undefined }],
    ]);
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { trackGoal } from './track';

describe('trackGoal', () => {
  beforeEach(() => {
    delete (window as { _paq?: unknown[][] }).dataLayer;
    delete (window as { _paq?: unknown[][] })._paq;
  });

  it('is a no-op when neither tracker is loaded', () => {
    expect(() => trackGoal('lead', 'cart-proforma')).not.toThrow();
  });

  it('pushes to Matomo only when _paq exists', () => {
    window._paq = [];
    trackGoal('lead', 'cart-proforma', '۲ قلم');
    expect(window._paq).toEqual([['trackEvent', 'lead', 'cart-proforma', '۲ قلم']]);
    expect(window.dataLayer).toBeUndefined();
  });

  it('pushes a matching GA4 event to dataLayer only when it exists', () => {
    window.dataLayer = [];
    trackGoal('lead', 'cart-proforma', '۲ قلم');
    expect(window.dataLayer).toEqual([
      { event: 'generate_lead', lead_type: 'cart-proforma', lead_detail: '۲ قلم' },
    ]);
    expect(window._paq).toBeUndefined();
  });

  it('omits lead_detail when no name is given', () => {
    window.dataLayer = [];
    trackGoal('contact', 'contact-form');
    expect(window.dataLayer).toEqual([{ event: 'contact_form_submit', lead_type: 'contact-form' }]);
  });

  it('maps each category to its own GA4 event name', () => {
    window.dataLayer = [];
    trackGoal('ai-chat', 'first-message', 'general');
    expect(window.dataLayer).toEqual([{ event: 'chat_start', lead_type: 'first-message', lead_detail: 'general' }]);
  });

  it('fires both trackers independently when both are loaded', () => {
    window._paq = [];
    window.dataLayer = [];
    trackGoal('lead', 'tender-estimate', '۳ قلم');
    expect(window._paq).toHaveLength(1);
    expect(window.dataLayer).toHaveLength(1);
  });
});

'use client';
import { useEffect } from 'react';
import {
  ATTRIBUTION_COOKIE,
  ATTRIBUTION_MAX_AGE_DAYS,
  readAttribution,
  serializeAttributionCookie,
} from '@/lib/utils/attribution';

/**
 * Records FIRST-touch campaign attribution once per visitor (W28).
 *
 * Renders nothing and ships a few hundred bytes — it exists so that when a
 * lead is later submitted, the server can say which campaign originally
 * brought that customer in. Before this, `leads.source` only recorded which
 * on-site widget produced the lead, so a visitor from a paid ad and one from
 * a Google search were indistinguishable and no ad spend could be tied to a
 * won deal.
 *
 * FIRST-touch: the cookie is written only when absent. A steel purchase is a
 * weeks-long decision — someone clicks an ad, deliberates, then returns via
 * Google to submit. Overwriting on that second visit would credit the deal
 * to "organic" and make the campaign that actually created the demand look
 * worthless.
 *
 * Deliberately no consent gate: this stores no identifier and cannot track
 * anyone across sites — it is a first-party note of how this visitor reached
 * this site, the same fact the referrer header already carries.
 */
export function AttributionCapture() {
  useEffect(() => {
    // First touch wins — never overwrite an existing attribution.
    if (document.cookie.split('; ').some((c) => c.startsWith(`${ATTRIBUTION_COOKIE}=`))) return;

    const attr = readAttribution(window.location.search, document.referrer, window.location.hostname);
    if (!attr) return; // Direct, untagged visit — nothing worth a cookie.

    const maxAge = ATTRIBUTION_MAX_AGE_DAYS * 24 * 60 * 60;
    // Lax, not None: this only ever needs to survive a top-level navigation
    // from an ad or a search result, which Lax already covers.
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie =
      `${ATTRIBUTION_COOKIE}=${serializeAttributionCookie(attr)}` +
      `; Max-Age=${maxAge}; Path=/; SameSite=Lax${secure}`;
  }, []);

  return null;
}

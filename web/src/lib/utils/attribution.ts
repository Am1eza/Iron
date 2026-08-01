/**
 * First-touch marketing attribution (W28) — the shared contract between the
 * browser that captures it and the server that stores it on a lead.
 *
 * Why first-touch and not last: a steel purchase is a long, considered B2B
 * decision — someone clicks an ad, thinks for three weeks, then returns via
 * Google and submits. Last-touch would credit that deal to "organic" and the
 * campaign that actually created the demand would look worthless. First-touch
 * answers the question the owner is really asking: *what brought this
 * customer to us in the first place?*
 *
 * Deliberately hand-rolled rather than a dependency: the whole job is reading
 * five query params and a referrer. The popular packages for it
 * (`@segment/utm-params`, `utm-params`) are abandonware — last published 2015
 * and 2016 — so adding one would mean taking on an unmaintained dependency to
 * avoid writing this file.
 */

/** First-party, readable by the server on the lead POST without extra
 *  plumbing — which is why a cookie rather than localStorage. */
export const ATTRIBUTION_COOKIE = 'at_attr';

/** Long enough to survive the weeks-long consideration gap described above,
 *  short enough that credit eventually expires rather than accruing forever. */
export const ATTRIBUTION_MAX_AGE_DAYS = 90;

/** Each field is capped before storage: these end up in a cookie that rides
 *  every request, and they are attacker-controlled (anyone can craft a URL
 *  with a megabyte-long `utm_campaign`). */
const MAX_FIELD = 120;

export interface Attribution {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  landingReferrer?: string;
}

function clean(v: string | null | undefined): string | undefined {
  if (!v) return undefined;
  // Strip control characters (a raw newline would corrupt the cookie) and
  // collapse whitespace before length-capping.
  // eslint-disable-next-line no-control-regex
  const s = v.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_FIELD);
  return s || undefined;
}

/**
 * Read attribution out of a landing URL + referrer. Returns `null` when
 * there is nothing worth recording, so callers can cheaply skip the write
 * (the overwhelmingly common case: a direct, untagged visit).
 */
export function readAttribution(search: string, referrer: string | undefined, selfHost: string): Attribution | null {
  const p = new URLSearchParams(search);
  const out: Attribution = {
    utmSource: clean(p.get('utm_source')),
    utmMedium: clean(p.get('utm_medium')),
    utmCampaign: clean(p.get('utm_campaign')),
  };

  // Our own pages are not a referrer — without this every internal
  // navigation would overwrite the real external source with "ahantime.com".
  if (referrer) {
    try {
      const host = new URL(referrer).hostname;
      if (host && host !== selfHost && !host.endsWith(`.${selfHost}`)) {
        out.landingReferrer = clean(referrer);
      }
    } catch {
      // A malformed referrer is simply not attribution data.
    }
  }

  return out.utmSource || out.utmMedium || out.utmCampaign || out.landingReferrer ? out : null;
}

/** Parse the cookie back. Never throws — a hand-edited or truncated cookie
 *  must degrade to "no attribution", never break lead creation. */
export function parseAttributionCookie(raw: string | undefined): Attribution | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(decodeURIComponent(raw)) as Record<string, unknown>;
    if (!v || typeof v !== 'object') return null;
    const out: Attribution = {
      utmSource: clean(typeof v.s === 'string' ? v.s : undefined),
      utmMedium: clean(typeof v.m === 'string' ? v.m : undefined),
      utmCampaign: clean(typeof v.c === 'string' ? v.c : undefined),
      landingReferrer: clean(typeof v.r === 'string' ? v.r : undefined),
    };
    return out.utmSource || out.utmMedium || out.utmCampaign || out.landingReferrer ? out : null;
  } catch {
    return null;
  }
}

/** Short keys — this rides on every request; `utmCampaign` would cost 4× the
 *  bytes of `c` for no benefit. */
export function serializeAttributionCookie(a: Attribution): string {
  return encodeURIComponent(
    JSON.stringify({ s: a.utmSource, m: a.utmMedium, c: a.utmCampaign, r: a.landingReferrer }),
  );
}

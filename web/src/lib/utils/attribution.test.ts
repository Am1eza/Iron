import { describe, it, expect } from 'vitest';
import {
  readAttribution,
  parseAttributionCookie,
  serializeAttributionCookie,
  type Attribution,
} from './attribution';

const SELF = 'ahantime.com';

describe('readAttribution', () => {
  it('reads the three campaign params off a tagged landing URL', () => {
    const a = readAttribution('?utm_source=instagram&utm_medium=cpc&utm_campaign=rebar-summer', undefined, SELF);
    expect(a).toEqual({ utmSource: 'instagram', utmMedium: 'cpc', utmCampaign: 'rebar-summer' });
  });

  it('returns null for a plain direct visit — nothing worth storing', () => {
    expect(readAttribution('', undefined, SELF)).toBeNull();
    expect(readAttribution('?page=2', '', SELF)).toBeNull();
  });

  it('records an external referrer when there is no campaign tag', () => {
    const a = readAttribution('', 'https://www.google.com/search?q=قیمت+میلگرد', SELF);
    expect(a?.landingReferrer).toContain('google.com');
    expect(a?.utmSource).toBeUndefined();
  });

  it('ignores our OWN site as a referrer — otherwise every internal click overwrites the real source', () => {
    expect(readAttribution('', 'https://ahantime.com/prices/rebar', SELF)).toBeNull();
    expect(readAttribution('', 'https://panel.ahantime.com/admin', SELF)).toBeNull();
  });

  it('survives a malformed referrer without throwing', () => {
    expect(readAttribution('', 'not a url', SELF)).toBeNull();
    expect(readAttribution('?utm_source=x', 'not a url', SELF)).toEqual({ utmSource: 'x' });
  });

  it('caps an attacker-supplied giant campaign value', () => {
    const a = readAttribution(`?utm_campaign=${'x'.repeat(5000)}`, undefined, SELF);
    expect(a!.utmCampaign!.length).toBe(120);
  });

  it('strips control characters that would corrupt the cookie', () => {
    const a = readAttribution('?utm_source=a%0d%0ab%00c', undefined, SELF);
    expect(a!.utmSource).toBe('abc');
  });
});

describe('attribution cookie round-trip', () => {
  it('survives serialize → parse unchanged', () => {
    const a: Attribution = {
      utmSource: 'instagram',
      utmMedium: 'cpc',
      utmCampaign: 'کمپین-میلگرد',
      landingReferrer: 'https://t.me/somechannel',
    };
    expect(parseAttributionCookie(serializeAttributionCookie(a))).toEqual(a);
  });

  it('degrades to null on a hand-edited or truncated cookie — never throws', () => {
    expect(parseAttributionCookie('{not json')).toBeNull();
    expect(parseAttributionCookie('%7B%22s%22%3A')).toBeNull();
    expect(parseAttributionCookie(undefined)).toBeNull();
    expect(parseAttributionCookie('')).toBeNull();
    // Valid JSON, wrong shape — must not produce a half-built object.
    expect(parseAttributionCookie(encodeURIComponent('"a string"'))).toBeNull();
    expect(parseAttributionCookie(encodeURIComponent('null'))).toBeNull();
  });

  it('drops unknown/empty fields rather than storing blanks', () => {
    expect(parseAttributionCookie(encodeURIComponent(JSON.stringify({ s: '', m: null, z: 'junk' })))).toBeNull();
  });
});

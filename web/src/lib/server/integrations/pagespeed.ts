/**
 * Google PageSpeed Insights API — real-world Core Web Vitals + Lighthouse
 * SEO/performance scores, for the SEO panel (2026-08-26).
 *
 * Free, official Google data, no billing required — unlike keyword rank
 * tracking or backlinks, there is no paid-data-provider dependency here.
 * The key used is restricted (PageSpeed Insights API only, IP-locked to the
 * production server) in the same Google Cloud project created for Search
 * Console OAuth.
 *
 * Only two URLs are checked, not every page: PSI calls are slow (5-20s
 * each) and this app has ~1000+ product pages — checking all of them on
 * every panel load would be both pointless (they share the same layout/JS
 * bundle, so Core Web Vitals are highly correlated) and slow. The homepage
 * (highest traffic) and `/prices` (the core product-discovery page, stable
 * and long-lived unlike any single SKU) are the two pages worth watching.
 *
 * Degrades to `null` on every failure path — same contract as
 * `matomoSummary`/`matomoSeoInsights`: this is a nice-to-have panel section,
 * never something that should break the page it lives on.
 */
import { reportError } from '@/lib/errors/report';
import { cacheGetJson, cacheSetJson, jitterTtl } from '@/lib/server/redis';

export interface PageSpeedResult {
  url: string;
  /** 0-100. `null` when Lighthouse didn't return a category score. */
  performanceScore: number | null;
  seoScore: number | null;
  /** Largest Contentful Paint, ms. Real-user (CrUX) data when the site has
   *  enough traffic for Google to report it, else Lighthouse lab data —
   *  `isFieldData` says which. */
  lcpMs: number | null;
  /** Cumulative Layout Shift, unitless. */
  cls: number | null;
  isFieldData: boolean;
}

const TIMEOUT_MS = 25_000; // PSI itself can take 10-20s; give it room.
// Core Web Vitals move slowly (days, not minutes) — checking hourly would
// burn the free quota for no reason. A day is generous enough to still
// catch a regression the same day it ships.
const CACHE_TTL_SECONDS = 24 * 60 * 60;
const CHECKED_PATHS = ['/', '/prices'] as const;

async function fetchOne(url: string, apiKey: string): Promise<PageSpeedResult | null> {
  const endpoint = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
  endpoint.searchParams.set('url', url);
  endpoint.searchParams.set('key', apiKey);
  endpoint.searchParams.set('strategy', 'mobile'); // Google's own ranking signal is mobile-first.
  endpoint.searchParams.append('category', 'performance');
  endpoint.searchParams.append('category', 'seo');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(endpoint.toString(), { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) {
      reportError(new Error(`pagespeed: HTTP ${res.status}`), { integration: 'pagespeed', url });
      return null;
    }
    const json = (await res.json()) as {
      lighthouseResult?: {
        categories?: { performance?: { score?: number }; seo?: { score?: number } };
        audits?: { 'largest-contentful-paint'?: { numericValue?: number }; 'cumulative-layout-shift'?: { numericValue?: number } };
      };
      loadingExperience?: {
        metrics?: {
          LARGEST_CONTENTFUL_PAINT_MS?: { percentile?: number };
          CUMULATIVE_LAYOUT_SHIFT_SCORE?: { percentile?: number };
        };
      };
    };
    const lh = json.lighthouseResult;
    const field = json.loadingExperience?.metrics;
    const hasField = !!field?.LARGEST_CONTENTFUL_PAINT_MS;
    const toScore = (s: number | undefined) => (typeof s === 'number' ? Math.round(s * 100) : null);
    const fieldCls = field?.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile;
    return {
      url,
      performanceScore: toScore(lh?.categories?.performance?.score),
      seoScore: toScore(lh?.categories?.seo?.score),
      lcpMs: hasField
        ? (field!.LARGEST_CONTENTFUL_PAINT_MS!.percentile ?? null)
        : (lh?.audits?.['largest-contentful-paint']?.numericValue ?? null),
      cls: hasField
        ? typeof fieldCls === 'number'
          ? fieldCls / 100
          : null
        : (lh?.audits?.['cumulative-layout-shift']?.numericValue ?? null),
      isFieldData: hasField,
    };
  } catch (err) {
    if (err instanceof Error && err.name !== 'AbortError') {
      reportError(err, { integration: 'pagespeed', url });
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function pageSpeedInsights(): Promise<PageSpeedResult[] | null> {
  const apiKey = process.env.PAGESPEED_API_KEY;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ahantime.com';
  if (!apiKey) return null; // Not configured — a silent, expected no-op.

  const cacheKey = 'pagespeed:v1';
  const cached = await cacheGetJson<PageSpeedResult[]>(cacheKey);
  if (cached) return cached;

  const results = await Promise.all(CHECKED_PATHS.map((path) => fetchOne(new URL(path, siteUrl).toString(), apiKey)));
  const ok = results.filter((r): r is PageSpeedResult => r !== null);
  if (ok.length === 0) return null;
  await cacheSetJson(cacheKey, ok, jitterTtl(CACHE_TTL_SECONDS));
  return ok;
}

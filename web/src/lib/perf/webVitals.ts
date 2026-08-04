/**
 * Web Vitals handling + performance budgets (performance.md). Budgets are the
 * "good" thresholds; anything past them is flagged for investigation. In dev we
 * log; in prod we'd beacon to an analytics endpoint (sendBeacon, no PII).
 */
export type Metric = {
  id: string;
  name: 'LCP' | 'CLS' | 'INP' | 'FCP' | 'TTFB' | string;
  value: number;
  rating?: 'good' | 'needs-improvement' | 'poor';
};

/** Core Web Vitals "good" thresholds. */
export const BUDGETS: Record<string, number> = {
  LCP: 2500, // ms
  INP: 200, // ms
  CLS: 0.1, // unitless
  FCP: 1800, // ms
  TTFB: 800, // ms
};

export function isWithinBudget(metric: Metric): boolean {
  const budget = BUDGETS[metric.name];
  return budget === undefined ? true : metric.value <= budget;
}

export function reportMetric(metric: Metric): void {
  const overBudget = !isWithinBudget(metric);
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console[overBudget ? 'warn' : 'debug'](
      `[vitals] ${metric.name}=${Math.round(metric.value)} (${metric.rating ?? '—'})${
        overBudget ? ' · over budget' : ''
      }`,
    );
    return;
  }
  // Production: fire-and-forget beacon. /api/vitals now actually reads this
  // (it used to 204 without parsing the body, so every sample was discarded).
  try {
    const body = JSON.stringify({
      name: metric.name,
      value: metric.value,
      rating: metric.rating,
      section: sectionOf(window.location?.pathname),
    });
    navigator.sendBeacon?.('/api/vitals', body);
  } catch {
    /* never let telemetry break the page */
  }
}

/**
 * The FIRST path segment only — 'prices', 'tools', 'proforma', '' for home.
 *
 * Deliberately not the full pathname: an LCP breach is only actionable per
 * area, and /proforma/<ref> and /track/<ref> carry a lookup token in the
 * second segment that must never end up in a log line for the sake of a
 * performance chart. Anything that isn't a plain ASCII slug is dropped rather
 * than sent — every URL segment in this app is ASCII by design.
 */
function sectionOf(pathname: string | undefined): string | undefined {
  const first = (pathname ?? '').split('/')[1] ?? '';
  return /^[a-z0-9-]{0,40}$/.test(first) ? first : undefined;
}

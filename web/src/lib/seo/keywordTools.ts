/**
 * Deep links to the two Persian keyword-research tools the owner actually
 * uses (US-14.4).
 *
 * NEITHER HAS A PUBLIC API — this is a shortcut, not an integration.
 * Verified before writing this, so nobody re-litigates it later:
 *
 *  - **keywordchi.com** advertises an API at `api.keywordchi.com`, but that
 *    host is their own internal backend and answers 403 to anyone outside
 *    their app; there is no documented public endpoint and no key to buy.
 *    Their search is a `POST /SearchMng/Search` guarded by an ASP.NET
 *    anti-forgery token, so it cannot be deep-linked either. What CAN be
 *    linked is `keywordchi.com/<keyword>`: that page loads with the search
 *    box PRE-FILLED with the phrase (confirmed against the live site — the
 *    input renders `value="قیمت ورق گالوانیزه"`), so the writer lands one
 *    click away from the result instead of retyping the phrase.
 *  - **Google Trends** has no public API either (the old `/trends/api/*`
 *    endpoints are undocumented, unauthenticated-but-rate-limited and change
 *    without notice). `trends.google.com/trends/explore` IS a real, stable
 *    deep link and lands directly on the chart for the phrase.
 *
 * So the UI shows two plain "open in a new tab" buttons and claims nothing
 * more. There is deliberately no "connected ✓" chrome, no cached numbers and
 * no background fetch: a fake integration that silently shows stale or
 * invented figures would be worse than no integration.
 */

import { normalizePersian } from '@/lib/utils/persianText';

/** Iran, Persian — the only market this site sells into. */
const TRENDS_GEO = 'IR';
const TRENDS_HL = 'fa';

/**
 * The phrase as the destination site should see it.
 *
 * The SEO checklist matches through `normalizePersian`, so a keyword typed on
 * an Arabic layout («كيفيت ورق») grades correctly against a Persian-typed
 * body — and would then have opened keywordchi on a spelling that site's index
 * does not contain. Normalising here keeps the two ends of the feature
 * consistent: what the panel scored is what the research tool searches.
 */
function forTool(keyword: string): string {
  return normalizePersian(keyword);
}

/**
 * `encodeURIComponent`, not `URLSearchParams`, for the keywordchi PATH — the
 * phrase is a path segment there, and `URLSearchParams` would encode a space
 * as `+`, which is only correct in a query string.
 */
export function keywordchiUrl(keyword: string): string | null {
  const k = forTool(keyword);
  if (!k) return null;
  return `https://keywordchi.com/${encodeURIComponent(k)}`;
}

/** Google Trends explore page, scoped to Iran and rendered in Persian. */
export function googleTrendsUrl(keyword: string): string | null {
  const k = forTool(keyword);
  if (!k) return null;
  const qs = new URLSearchParams({ q: k, geo: TRENDS_GEO, hl: TRENDS_HL });
  return `https://trends.google.com/trends/explore?${qs.toString()}`;
}

export interface KeywordToolLink {
  id: 'keywordchi' | 'trends';
  label: string;
  /** Tooltip/`title` — says exactly what the click does, per the note above. */
  hint: string;
  url: string;
}

/** Both links for a keyword, or an empty list when there is no keyword yet. */
export function keywordToolLinks(keyword: string): KeywordToolLink[] {
  const kc = keywordchiUrl(keyword);
  const gt = googleTrendsUrl(keyword);
  if (!kc || !gt) return [];
  return [
    {
      id: 'keywordchi',
      label: 'کیوردچی',
      hint: 'کیوردچی را در تب جدید باز می‌کند؛ عبارت در کادر جستجویش از پیش نوشته شده — فقط «جستجو» را بزنید.',
      url: kc,
    },
    {
      id: 'trends',
      label: 'گوگل ترندز',
      hint: 'نمودار میزان جستجوی این عبارت در ایران را در گوگل ترندز باز می‌کند.',
      url: gt,
    },
  ];
}

/**
 * Persian labels for `leads.source` — the ONE copy (W28).
 *
 * This map previously existed three times (the BI dashboard, the marketing
 * dashboard and the leads tab) and two of them disagreed: the same channel
 * read «سبد خرید» on one screen and «سبد درخواست» on another, «تماس با ما»
 * versus «تماس». Staff comparing two pages had no way to know it was the
 * same thing.
 *
 * Note what these actually mean: they name the FORM on our own site that
 * created the lead, not the marketing channel that brought the visitor. A
 * person arriving from Google and one from an Instagram ad both submit the
 * price table and both land here as «جدول قیمت». Real acquisition
 * attribution lives in the `utm_*` columns — see `utils/attribution.ts`.
 */
export const LEAD_SOURCE_LABEL: Record<string, string> = {
  table: 'جدول قیمت',
  ai: 'مشاور هوشمند',
  cart: 'سبد خرید',
  cooperation: 'همکاری',
  tool: 'ابزارها',
  warehouse: 'انبار',
  contact: 'تماس با ما',
};

/** `source` is a DB enum and the service layer coerces unknown values, so a
 *  miss here means someone added an enum value without a label — show the raw
 *  key rather than an empty cell, so it is visibly wrong instead of silently
 *  missing. */
export function leadSourceLabel(source: string): string {
  return LEAD_SOURCE_LABEL[source] ?? source;
}

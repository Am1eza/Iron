/**
 * Shared AI-advisor vocabulary — ONE home for the strings/tables the live
 * server engine and the local fallback engine must agree on byte-for-byte
 * (chip labels are a wire protocol: QuickReply deep-links by exact match).
 */

/** Persian/English keyword → catalog category. Used by the server tools'
 *  resolveCategory and the client fallback's bulk detection. */
export const CATEGORY_ALIASES: { re: RegExp; slug: string; name: string }[] = [
  { re: /rebar|میلگرد/, slug: 'rebar', name: 'میلگرد' },
  { re: /ibeam|beam|تیرآهن|تیراهن|هاش|آی‌بیم|ای بیم/, slug: 'ibeam', name: 'تیرآهن' },
  { re: /sheet|ورق/, slug: 'sheet', name: 'ورق' },
  { re: /profile|پروفیل|قوطی/, slug: 'profile', name: 'پروفیل' },
  { re: /angle|channel|نبشی|ناودانی|سپری/, slug: 'angle-channel', name: 'نبشی و ناودانی' },
  { re: /pipe|لوله/, slug: 'pipe', name: 'لوله' },
  { re: /wire|مفتول|سیم|کلاف|توری/, slug: 'wire', name: 'سیم و مفتول' },
];

/** Quick-reply labels the client maps to deep links (exact-match protocol). */
export const CHIP = {
  proforma: 'دریافت پیش‌فاکتور',
  allPrices: 'همهٔ قیمت‌ها',
  weighTool: 'وزن دقیق را حساب کن',
} as const;

/**
 * Opening starter chips — real, common visitor questions, each written to
 * land on a DIFFERENT tool (getPrice / calcWeight / compareFactories /
 * estimateProject) so clicking one is also a first taste of what the
 * advisor can actually do, not just a lead-qualification funnel step.
 *
 * The weight-calc chip deliberately asks about میلگرد (rebar), not تیرآهن
 * (I-beam): calcWeight's ibeam/channel path needs the model to pick
 * sizeCode over diameterMm (a distinct catalog-lookup parameterization from
 * the other 7 shapes) and live-tested more than once as unreliable even
 * after tightening the tool schema/prompt — see the calcWeight-shape-
 * confusion audit note. رebar's plain d²/162×length path doesn't have that
 * failure mode, so it's the safer capability to put in front of every new
 * visitor until ibeam/channel's reliability is separately fixed.
 */
export const PURPOSE_CHIPS = [
  'قیمت میلگرد امروز چقدره؟',
  'وزن دقیق یه شاخه میلگرد ۱۴ به طول ۱۲ متر رو حساب کن',
  '۲۰ تن میلگرد از کدوم کارخونه ارزون‌تره؟',
  'برای یه ساختمان ۱۰۰ متری دو طبقه چقدر آهن لازمه؟',
];

/**
 * Deterministic follow-up chips for a turn (AC-D-7) — zero model tokens.
 * Lives here (not inline in the route) for two reasons: Next.js's App
 * Router route files reject any export that isn't an HTTP method handler
 * or one of its own special config exports, so a plain helper function
 * cannot live in route.ts at all; and this exact logic has now shipped two
 * live bugs in a row with zero coverage (evals.test.ts drives
 * runAdvisorPipeline directly and never touches the route), so it needs to
 * be a plain, unit-testable function regardless.
 */
export function selectFollowUpChips(
  toolsUsed: ReadonlySet<string>,
  userMessageCount: number,
  lastUserMessage: string | undefined,
): string[] {
  if (toolsUsed.has('estimateProject') || toolsUsed.has('createLead')) return [CHIP.proforma, CHIP.weighTool];
  if (toolsUsed.has('getPrice') || toolsUsed.has('calcWeight') || toolsUsed.has('compareFactories'))
    return [CHIP.proforma, CHIP.allPrices];
  // searchGuides answered a knowledge question, not a pricing one — neither
  // the starter chips (redundant: onboarding is over) nor the proforma/
  // prices pair (presumes a purchase that isn't what was asked) fit here.
  // The model's own text already ends on one clear next step (rule 17); no
  // chips is the honest choice.
  if (toolsUsed.has('searchGuides')) return [];
  const alreadyAsked = lastUserMessage ? (PURPOSE_CHIPS as readonly string[]).includes(lastUserMessage) : false;
  if (userMessageCount <= 1 && !alreadyAsked) return [...PURPOSE_CHIPS];
  return [];
}

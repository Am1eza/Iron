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
  /** After a project estimate: the answer is now an itemised list of real
   *  products, so the next step is «all of it», not one item. Sent as a chat
   *  turn (no deep link), which is what puts prepareProforma on the whole
   *  list inside THIS conversation. */
  proformaAll: 'همهٔ این اقلام را پیش‌فاکتور کن',
  /** Also after an estimate: the one input the visitor is most likely to
   *  want to correct, phrased as the correction itself. */
  perFloorArea: 'متراژی که گفتم مساحت هر طبقه بود',
  compareFactories: 'ارزان‌ترین کارخانه را نشانم بده',
  /** After a price answer: the question every buyer actually has next, and the
   *  one the advisor used to refuse outright. Answered by forecastPrice, which
   *  gives a DIRECTION and a band — never a price for a date. */
  outlook: 'قیمتش بالا می‌رود یا پایین؟',
  /** After an outlook: the honest way to act on a directional call is to lock
   *  today's number or wait for a level, not to trade the forecast. */
  proformaToday: 'با قیمت امروز پیش‌فاکتور بگیر',
  /** Answered by setPriceAlert — a real row in `alerts`, an SMS when the
   *  price crosses. Offered next to an outlook because "wait" is only a real
   *  option if something tells you when the waiting is over. */
  priceAlert: 'اگر ارزان شد خبرم کن',
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
 *
 * It stays deterministic and keyed on TOOLS, not on model output — but a tool
 * name alone turned out to be too coarse. A project estimate used to offer
 * «وزن دقیق را حساب کن», a tool the visitor has no use for at that moment
 * (they have just been handed four tonnages), while the one thing they
 * obviously want next — all of it on a پیش‌فاکتور — was not on offer at all.
 * So the estimate branch reads the tool's own RESULT (see EstimateFacts): the
 * branching is still a plain table, just keyed on what the tool found rather
 * than only on which tool ran.
 */

/** The few facts about this turn's estimateProject result that change what
 *  the next step should be. Assembled by the route from the tool output; all
 *  fields optional so a turn that never estimated simply omits it. */
export interface EstimateFacts {
  /** The estimate produced at least one line with a real, orderable product. */
  hasOrderableLines?: boolean;
  /** Every line resolved to a live price, so a mill can actually be named. */
  hasPrices?: boolean;
  /** The tool had to assume the area was the total across all floors. */
  assumedTotalArea?: boolean;
}

export function selectFollowUpChips(
  toolsUsed: ReadonlySet<string>,
  userMessageCount: number,
  lastUserMessage: string | undefined,
  /** Options of an unresolved «کدام کارخانه؟» this turn ended on (see the
   *  pipeline's choiceChips). They ARE the next step, so they outrank every
   *  generic follow-up below. */
  choiceOptions?: readonly string[],
  estimate?: EstimateFacts,
): string[] {
  // A pending choice beats everything: the visitor was just asked a question,
  // and these are its answers. Tapping one sends that product name as the
  // next message, which is the same path typing it has always taken.
  if (choiceOptions && choiceOptions.length > 0) return [...choiceOptions];
  // The confirmation card IS this turn's next step (item list + «تأیید و ثبت
  // درخواست», or the login button for a guest) — a «دریافت پیش‌فاکتور» chip
  // next to it would offer the same action twice, in two different places.
  if (toolsUsed.has('prepareProforma')) return [];
  // The options card IS this turn's next step — a row of generic follow-ups
  // under a row of real product chips asks the visitor two questions at once
  // and makes it ambiguous which row answers which.
  if (toolsUsed.has('productOptions')) return [];
  if (toolsUsed.has('estimateProject')) {
    const chips: string[] = [];
    // An itemised estimate's next step is the whole list, not one item.
    chips.push(estimate?.hasOrderableLines ? CHIP.proformaAll : CHIP.proforma);
    // The assumption the answer just stated out loud is also the likeliest
    // thing to be wrong, so the correction is one tap rather than a sentence
    // the visitor has to compose.
    if (estimate?.assumedTotalArea) chips.push(CHIP.perFloorArea);
    // No live price means no mill was named; offering the comparison is only
    // honest when there is something to compare.
    else if (estimate?.hasPrices) chips.push(CHIP.compareFactories);
    else chips.push(CHIP.allPrices);
    return chips;
  }
  // An outlook's only honest next steps are acting on TODAY's price or
  // asking again later — never «چقدر می‌شود؟», which is the question the
  // forecast deliberately does not answer.
  if (toolsUsed.has('forecastPrice')) return [CHIP.proformaToday, CHIP.priceAlert];
  // The alert is set; the next step is the purchase, not another alert.
  if (toolsUsed.has('setPriceAlert')) return [CHIP.proforma, CHIP.allPrices];
  if (
    toolsUsed.has('getPrice') ||
    toolsUsed.has('calcWeight') ||
    toolsUsed.has('compareFactories') ||
    toolsUsed.has('priceHistory')
  )
    // «بالا می‌رود یا پایین؟» sits here on purpose: it is the most common real
    // follow-up to a price, and now that a grounded tool answers it, offering
    // it is better than waiting for the visitor to discover the advisor will.
    return [CHIP.proforma, CHIP.outlook, CHIP.allPrices];
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

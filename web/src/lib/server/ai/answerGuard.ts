/**
 * The last gate before an answer reaches a customer: is this an ANSWER, or is
 * it the model thinking out loud?
 *
 * Observed in production on 2026-08-17, verbatim, in the chat bubble a real
 * visitor would have read:
 *
 *   «We need to respond to user. The user wants to proceed with a proforma
 *   for ۳ tons of ۱۶mm rebar, but the system says product not found … Also we
 *   must follow style: use "تو" etc. Also we must not reveal internal tool
 *   calls.»
 *
 * This is a REASONING model (nemotron). Its private deliberation normally
 * never reaches `delta.content`, but when it does, the relay has no way to
 * tell it apart from an answer, and what the visitor gets is English, meta,
 * and a recital of the advisor's own internal instructions.
 *
 * Rule 20 of the system prompt already says «پاسخ فقط و فقط فارسی باشد»; this
 * is the enforcement. It is deliberately a HIGH bar rather than a general
 * English-detector: the answer's own vocabulary legitimately includes short
 * Latin grade codes (`A3`, `ST37`, `IPE14`, `LC`), so those must never trip
 * it. What no Persian answer ever contains is eight English words.
 */

/** Latin words of 3+ letters. `A3`/`ST37`/`IPE14` are 1-2 letters + digits and
 *  do not match; «mm» and «kg» are 2 letters and do not match either. */
const LATIN_WORD = /(?<![\p{L}\d])[A-Za-z]{3,}(?![\p{L}])/gu;

/** How many such words an answer may contain before it stops being Persian.
 *  Measured against the leak above (60+) and against every eval scenario's
 *  legitimate text (0). Eight leaves room for a product name a mill genuinely
 *  writes in Latin without licensing a paragraph of English. */
const MAX_LATIN_WORDS = 8;

/** Phrases the model uses about ITSELF, never to a customer. One of these
 *  plus any English at all is already the leak. */
const REASONING_MARKERS =
  /\b(we need to|we must|we should|the user (wants|asks|said)|let'?s craft|let me (think|craft)|i should respond|the rule says|so we can|thus we can)\b/i;

/**
 * True when `text` reads as internal deliberation rather than an answer.
 *
 * The caller's move on `true` is to ask once more and then, failing that, to
 * show nothing at all: the advisor's own failure notice («دستیار هوشمند
 * موقتاً در دسترس نیست … دوباره امتحان کن») with its retry is a far better
 * thing to put in front of a buyer than the model's scratchpad.
 */
export function looksLikeLeakedReasoning(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const latinWords = trimmed.match(LATIN_WORD)?.length ?? 0;
  if (latinWords >= MAX_LATIN_WORDS) return true;
  // A marker alone is not enough — «the rule says» could conceivably appear
  // inside a quoted standard name — but a marker next to English prose is.
  return latinWords >= 3 && REASONING_MARKERS.test(trimmed);
}

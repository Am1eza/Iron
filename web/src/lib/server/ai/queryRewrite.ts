/**
 * J-219 — «query rewrite» detection.
 *
 * `resolveProduct` already refuses to guess: a query matching more than one
 * SKU comes back as `{kind:'many'}` and becomes real choice chips, so the
 * TOOL decides the ambiguity rather than trusting the model's word for it.
 * The gap the audit found is one level up: nothing stops the model from
 * quietly making the query MORE specific than the visitor's message — adding
 * a factory name of its own invention — so that it matches exactly one row
 * and the ambiguity never surfaces at all.
 *
 * The audit deliberately asks for monitoring here, not a hard guard: this is
 * a theoretical bypass of a mechanism that works, and blocking it outright
 * would break the legitimate case where the model carries a factory forward
 * from EARLIER in the same conversation («و نیشابورش چند؟»). So this measures
 * the real rate first — `answerTrace.queryRewrites`, surfaced on the admin
 * usage console — and the decision about a guard waits for that number.
 *
 * Because it feeds a rate, a false positive is not free: an inflated count
 * would make a non-problem look like a problem. Hence the conservative
 * filters below.
 */
import { normalizeDigits } from '@/lib/utils/format';

const ZWNJ = '‌';

/**
 * Persian words this short match by accident — «یک», «تا», «هم» — and
 * `aiTools.ts#resolveProduct` already uses exactly this threshold when it
 * drops unknown tokens and retries a search, for the same reason.
 */
const MIN_TOKEN_LENGTH = 3;

/** Compounds the catalog writes solid but people write apart, and vice
 *  versa. Folded to one form on both sides so «تیر آهن» in the message
 *  covers «تیرآهن» in the tool call rather than counting as an addition. */
const COMPOUNDS: Array<[string, string]> = [
  ['تیر', 'آهن'],
  ['ذوب', 'آهن'],
  ['نبشی', 'آهن'],
  ['سپری', 'آهن'],
  ['ورق', 'آهن'],
];

function fold(s: string): string {
  let out = normalizeDigits(s).replace(new RegExp(ZWNJ, 'g'), ' ');
  for (const [a, b] of COMPOUNDS) out = out.replace(new RegExp(`${a}\\s+${b}`, 'g'), `${a}${b}`);
  // Punctuation is noise for this comparison: «میلگرد ۱۴؟» and «میلگرد ۱۴»
  // are the same request.
  return out.replace(/[.,،؛؟!:()«»"'\-_/\\]/g, ' ').toLowerCase();
}

function tokens(s: string): string[] {
  return fold(s)
    .split(/\s+/)
    .filter((t) => t.length >= MIN_TOKEN_LENGTH);
}

/**
 * Tokens the model put in a tool query that the visitor never typed anywhere
 * in the conversation.
 *
 * Compares against the WHOLE user-side transcript, not just the last message,
 * because carrying a factory forward from three turns ago is normal, correct
 * behaviour and must not be counted as an invention.
 */
export function addedQueryTokens(toolQuery: string, userTexts: readonly string[]): string[] {
  const q = toolQuery.trim();
  if (!q) return [];
  const said = new Set<string>();
  for (const text of userTexts) for (const t of tokens(text)) said.add(t);
  // A substring check as well as an exact one: the visitor writing
  // «میلگرد۱۴» should cover a tool query of «میلگرد».
  const saidJoined = userTexts.map(fold).join(' ');
  return [...new Set(tokens(q))].filter((t) => !said.has(t) && !saidJoined.includes(t));
}

/** The tool arguments that carry a free-text product query. */
const QUERY_ARGS = ['query', 'product', 'sub', 'category', 'size'] as const;

/** Every added token across a single tool call's query-ish arguments. */
export function rewrittenTokensForCall(
  args: Record<string, unknown>,
  userTexts: readonly string[],
): string[] {
  const added = new Set<string>();
  for (const key of QUERY_ARGS) {
    const value = args[key];
    if (typeof value !== 'string') continue;
    for (const t of addedQueryTokens(value, userTexts)) added.add(t);
  }
  return [...added];
}

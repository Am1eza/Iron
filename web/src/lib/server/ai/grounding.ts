/**
 * Grounding ledger + post-generation numeric validator (acceptance-criteria AC-D-3).
 *
 * Every number a tool returns is recorded in a per-request ledger. Before any
 * model text reaches the user, `sanitizeGrounded` scans it and censors any
 * money/weight claim that was NOT produced by a tool and NOT typed by the user.
 *
 * The scanner is scale-aware: «۳۸ هزار و ۵۰۰ تومان» is evaluated as 38,500 and
 * checked as a whole (so a grounded price verbalized that way passes, while an
 * invented «۴۵ هزار تومان» fails even if a *different* scale of 45 was real).
 * It covers Persian, Arabic-Indic and Latin digits, tolerates ZWNJ joiners,
 * exempts date patterns, and rejects digit-less spelled-out money figures
 * outright (the prompt requires digits). Pure functions; unit-tested.
 */
import { normalizeDigits } from '@/lib/utils/format';

export class GroundingLedger {
  private nums = new Set<number>();

  /** Record one grounded number (tool output or a code-computed derivative). */
  add(n: number): void {
    if (!Number.isFinite(n)) return;
    this.nums.add(Math.round(n));
  }

  addAll(ns: Iterable<number>): void {
    for (const n of ns) this.add(n);
  }

  /** Recursively record every number in a tool's JSON result. */
  addFromJson(value: unknown): void {
    if (typeof value === 'number') this.add(value);
    else if (Array.isArray(value)) value.forEach((v) => this.addFromJson(v));
    else if (value && typeof value === 'object')
      Object.values(value as Record<string, unknown>).forEach((v) => this.addFromJson(v));
  }

  has(n: number): boolean {
    return this.nums.has(Math.round(n));
  }

  /** Scale-tolerant check: a claim of `value` at granularity `scale` (1000 for
   *  «هزار», 1e6 for «میلیون») matches any grounded number in the same bucket —
   *  «۳۸ هزار» is a fair verbalization of a grounded 38,500. */
  hasNear(value: number, scale: number): boolean {
    if (this.nums.has(Math.round(value))) return true;
    for (const n of this.nums) if (Math.abs(n - value) < scale) return true;
    return false;
  }

  get size(): number {
    return this.nums.size;
  }
}

/* ------------------------------------------------------------------ */
/* Token grammar (Persian ۰-۹ · Arabic-Indic ٠-٩ · Latin digits;       */
/* ZWNJ (U+200C) treated as a joiner-space everywhere)                 */
/* ------------------------------------------------------------------ */

const D = '\\d۰-۹٠-٩';
/** Digits with optional thousand separators + decimals. */
const NUM = `[${D}][${D}٬،,]*(?:[.٫][${D}]+)?`;
/** Space or ZWNJ run. */
const J = '[\\s\\u200c]*';

const NUM_TOKEN = new RegExp(NUM, 'g');
/** «N هزار [و M [هزار]]» compound, optionally followed by a currency word. */
const SCALED = new RegExp(
  `(${NUM})${J}(هزار|میلیون|میلیارد)(?:${J}و${J}(${NUM})(?:${J}(هزار))?)?`,
  'g',
);
/** Date patterns are data, not price claims: 1405/04/11 · 2026-06-27. */
const DATE = new RegExp(`[${D}]{4}[/\\-][${D}]{1,2}[/\\-][${D}]{1,2}`, 'g');
/** Units that make ANY attached number a money/weight claim. */
const CLAIM_UNIT = new RegExp(`^${J}(هزار|میلیون|میلیارد|تومان|ریال|کیلوگرم|کیلو(?!متر)|گرم)`);
/** Digit-less spelled-out money («چهل و دو هزار تومان») — the prompt requires
 *  digits, so any word-number scaled to a currency is censored outright. */
const WORD_NUM =
  '(?:یک|دو|سه|چهار|پنج|شش|شیش|هفت|هشت|نه|ده|یازده|دوازده|سیزده|چهارده|پانزده|شانزده|هفده|هجده|نوزده|بیست|سی|چهل|پنجاه|شصت|هفتاد|هشتاد|نود|صد|دویست|سیصد|چهارصد|پانصد|ششصد|هفتصد|هشتصد|نهصد)';
const WORD_MONEY = new RegExp(
  `${WORD_NUM}(?:${J}و${J}${WORD_NUM})*${J}(?:هزار|میلیون|میلیارد)${J}(?:تومان|ریال)`,
  'g',
);

const SCALE_VALUE: Record<string, number> = { هزار: 1_000, میلیون: 1_000_000, میلیارد: 1_000_000_000 };

export function parseNumericToken(token: string): number {
  const cleaned = normalizeDigits(token).replace(/[٬،,]/g, '').replace('٫', '.');
  return Number(cleaned);
}

/** One numeric claim found in text: its resolved value + match span + scale. */
type Claim = { start: number; end: number; value: number; scale: number; isClaim: boolean };

function findClaims(text: string): Claim[] {
  const claims: Claim[] = [];
  const covered: [number, number][] = [];
  const overlaps = (s: number, e: number) => covered.some(([cs, ce]) => s < ce && cs < e);

  // 1. Dates — mark exempt so their numbers are never treated as prices.
  for (const m of text.matchAll(DATE)) covered.push([m.index, m.index + m[0].length]);

  // 2. Scaled compounds — evaluate the FULL value («۳۸ هزار و ۵۰۰» → 38500).
  for (const m of text.matchAll(SCALED)) {
    const s = m.index;
    const e = s + m[0].length;
    if (overlaps(s, e)) continue;
    const head = parseNumericToken(m[1]!);
    const scale = SCALE_VALUE[m[2]!]!;
    let value = head * scale;
    if (m[3]) value += parseNumericToken(m[3]) * (m[4] ? SCALE_VALUE[m[4]]! : 1);
    if (Number.isFinite(value)) {
      claims.push({ start: s, end: e, value, scale, isClaim: true });
      covered.push([s, e]);
    }
  }

  // 3. Remaining bare tokens.
  for (const m of text.matchAll(NUM_TOKEN)) {
    const s = m.index;
    const e = s + m[0].length;
    if (overlaps(s, e)) continue;
    const value = parseNumericToken(m[0]);
    if (!Number.isFinite(value)) continue;
    const tail = text.slice(e, e + 14);
    const isClaim = Math.round(value) >= SIGNIFICANT_MIN || CLAIM_UNIT.test(tail);
    claims.push({ start: s, end: e, value, scale: 1, isClaim });
  }

  return claims.sort((a, b) => a.start - b.start);
}

/** All numeric values in a user message — their own inputs are never "invented".
 *  Scale-aware, so «بودجه ۵۰۰ میلیون» whitelists 500,000,000 (not the bare 500). */
export function numbersInText(text: string): number[] {
  return findClaims(text).map((c) => Math.round(c.value));
}

export const UNGROUNDED_REPLACEMENT = '«قیمت دقیق را کارشناس اعلام می‌کند»';

/** Claims below this are sizes/counts/floors — safe unless glued to a unit. */
const SIGNIFICANT_MIN = 1000;

export interface SanitizeResult {
  text: string;
  /** Values that had to be censored — non-empty means the model tried to invent. */
  violations: number[];
}

/**
 * Enforce AC-D-3 on a final answer: every significant number must exist in the
 * tool ledger or in the user's own messages. Ungrounded ones are replaced.
 */
export function sanitizeGrounded(
  text: string,
  ledger: GroundingLedger,
  userNumbers: ReadonlySet<number>,
): SanitizeResult {
  const violations: number[] = [];
  const cuts: { start: number; end: number }[] = [];

  for (const c of findClaims(text)) {
    if (!c.isClaim) continue;
    const rounded = Math.round(c.value);
    const ok =
      c.scale > 1
        ? ledger.hasNear(c.value, c.scale) || userNumbers.has(rounded)
        : ledger.has(rounded) || userNumbers.has(rounded);
    if (!ok) {
      violations.push(rounded);
      cuts.push({ start: c.start, end: c.end });
    }
  }

  // Spelled-out money with no digits is never grounded — censor the phrase.
  // (-1 marks a word-form violation so the retry still triggers.)
  for (const m of text.matchAll(WORD_MONEY)) {
    const s = m.index;
    const e = s + m[0].length;
    if (cuts.some((c) => s < c.end && c.start < e)) continue;
    violations.push(-1);
    cuts.push({ start: s, end: e });
  }

  if (cuts.length === 0) return { text, violations };

  cuts.sort((a, b) => b.start - a.start);
  let out = text;
  for (const { start, end } of cuts) out = out.slice(0, start) + UNGROUNDED_REPLACEMENT + out.slice(end);
  return { text: out, violations };
}

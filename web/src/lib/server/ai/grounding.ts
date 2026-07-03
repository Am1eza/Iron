/**
 * Grounding ledger + post-generation numeric validator (acceptance-criteria AC-D-3).
 *
 * Every number a tool returns is recorded in a per-request ledger, TAGGED by
 * kind (money/weight/other, inferred from the JSON field name it came from —
 * `rebarCost` is money, `rebarKg` is weight). Before any model text reaches
 * the user, `sanitizeGrounded` scans it and censors any money/weight claim
 * that was NOT produced by a tool OF THE SAME KIND and NOT typed by the user.
 * The kind tag exists specifically so a real weight (e.g. 3000 kg from
 * calcWeight) can never validate an invented PRICE that happens to share the
 * same numeral («۳٬۰۰۰ تومان») — cross-field numeric coincidence is common
 * enough in this domain to matter.
 *
 * The scanner is scale-aware: «۳۸ هزار و ۵۰۰ تومان» is evaluated as 38,500 and
 * checked as a whole (so a grounded price verbalized that way passes, while an
 * invented «۴۵ هزار تومان» fails even if a *different* scale of 45 was real).
 * It covers Persian, Arabic-Indic and Latin digits, tolerates ZWNJ joiners,
 * exempts date patterns, and rejects digit-less spelled-out money/weight
 * figures outright, scaled or not (the prompt requires digits). Pure
 * functions; unit-tested.
 */
import { normalizeDigits } from '@/lib/utils/format';

export type NumberKind = 'money' | 'weight' | 'other';

export class GroundingLedger {
  private byNum = new Map<number, Set<NumberKind>>();

  /** Record one grounded number (tool output or a code-computed derivative). */
  add(n: number, kind: NumberKind = 'other'): void {
    if (!Number.isFinite(n)) return;
    const r = Math.round(n);
    const set = this.byNum.get(r) ?? new Set<NumberKind>();
    set.add(kind);
    this.byNum.set(r, set);
  }

  addAll(ns: Iterable<number>, kind: NumberKind = 'other'): void {
    for (const n of ns) this.add(n, kind);
  }

  /** Recursively record every number in a tool's JSON result, tagging each by
   *  its field name (e.g. `rebarKg` → weight, `rebarCost`/`price` → money). */
  addFromJson(value: unknown, keyHint?: string): void {
    if (typeof value === 'number') this.add(value, kindFromKey(keyHint));
    // Tool-returned STRINGS are tool data too: a guide excerpt (searchGuides)
    // carries its figures as prose, and quoting a number the tool itself
    // returned must never be censored. This only widens the ledger's INPUT
    // (what a tool actually said) — the validator gate itself is untouched.
    else if (typeof value === 'string') this.addAll(numbersInText(value), kindFromKey(keyHint));
    else if (Array.isArray(value)) value.forEach((v) => this.addFromJson(v, keyHint));
    else if (value && typeof value === 'object')
      Object.entries(value as Record<string, unknown>).forEach(([k, v]) => this.addFromJson(v, k));
  }

  /** `kind` omitted → match regardless of tag (used for plain lookups/tests).
   *  `kind` given → matches that kind or an untagged/'other' entry — money
   *  claims never validate against a number ONLY ever seen tagged 'weight'. */
  has(n: number, kind?: NumberKind): boolean {
    const set = this.byNum.get(Math.round(n));
    if (!set) return false;
    if (!kind) return true;
    return set.has(kind) || set.has('other');
  }

  /** Scale-tolerant check: a claim of `value` at granularity `scale` (1000 for
   *  «هزار», 1e6 for «میلیون») matches any grounded number of the same kind in
   *  the same bucket — «۳۸ هزار» is a fair verbalization of a grounded 38,500. */
  hasNear(value: number, scale: number, kind?: NumberKind): boolean {
    const r = Math.round(value);
    if (this.has(r, kind)) return true;
    for (const [n, set] of this.byNum) {
      if (Math.abs(n - r) < scale && (!kind || set.has(kind) || set.has('other'))) return true;
    }
    return false;
  }

  get size(): number {
    return this.byNum.size;
  }
}

/** Heuristic kind from a JSON field name — conservative: only tag what the
 *  name clearly implies, everything else stays 'other' (permissive, matching
 *  the pre-existing behavior for numbers we can't classify). */
function kindFromKey(key?: string): NumberKind {
  if (!key) return 'other';
  const k = key.toLowerCase();
  if (/area|floor|qty|quantity|count|percent|pct|rate\b|index|id$/.test(k)) return 'other';
  // Money checked FIRST: a field like `avgRebarPricePerKg` contains both
  // "price" and a trailing "kg" — it's the price, not the weight.
  if (/price|cost|toman|rial|amount|fee|budget/.test(k)) return 'money';
  if (/weight|kg\b|ton/.test(k)) return 'weight';
  return 'other';
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
/** System reference codes (nextRef): `PF-14050413-0001-HFQ35H` — prefix +
 *  8-digit Jalali stamp + 4-digit sequence + random suffix. The stamp/seq
 *  segments are plain digit runs that would otherwise read as bare price
 *  claims (≥1000, no unit) and get censored mid-code — exempt the whole
 *  token, the same way a date is exempt. */
const REF_CODE = /\b(?:PF|RQ|OR|LD|WH)-\d{8}-\d{4}-[A-Z0-9]{4,8}\b/g;
const MONEY_UNIT = '(?:تومان|ریال)';
const WEIGHT_UNIT = '(?:کیلوگرم|کیلو(?!متر)|گرم)';
/** Units that make ANY attached number a money/weight claim. */
const CLAIM_UNIT = new RegExp(`^${J}(هزار|میلیون|میلیارد|${MONEY_UNIT.slice(3, -1)}|${WEIGHT_UNIT.slice(3, -1)})`);
/** Digit-less spelled-out money/weight («چهل و دو هزار تومان», «پانصد تومان»,
 *  «صد کیلوگرم») — the prompt requires digits, so ANY word-number directly
 *  attached to a money/weight unit is censored outright, scale word or not. */
const WORD_NUM =
  '(?:یک|دو|سه|چهار|پنج|شش|شیش|هفت|هشت|نه|ده|یازده|دوازده|سیزده|چهارده|پانزده|شانزده|هفده|هجده|نوزده|بیست|سی|چهل|پنجاه|شصت|هفتاد|هشتاد|نود|صد|دویست|سیصد|چهارصد|پانصد|ششصد|هفتصد|هشتصد|نهصد)';
const WORD_MONEY = new RegExp(
  `${WORD_NUM}(?:${J}و${J}${WORD_NUM})*(?:${J}(?:هزار|میلیون|میلیارد))?${J}(?:${MONEY_UNIT}|${WEIGHT_UNIT})`,
  'g',
);

const SCALE_VALUE: Record<string, number> = { هزار: 1_000, میلیون: 1_000_000, میلیارد: 1_000_000_000 };

export function parseNumericToken(token: string): number {
  const cleaned = normalizeDigits(token).replace(/[٬،,]/g, '').replace('٫', '.');
  return Number(cleaned);
}

/** Which kind of claim a trailing unit implies — undefined when the tail has
 *  no unit at all (a bare large number: kind-agnostic, matches either). */
function claimKind(tail: string): NumberKind | undefined {
  if (new RegExp(`^${J}${WEIGHT_UNIT}`).test(tail)) return 'weight';
  if (new RegExp(`^${J}(?:${MONEY_UNIT}|هزار|میلیون|میلیارد)`).test(tail)) return 'money';
  return undefined;
}

/** One numeric claim found in text: its resolved value + match span + scale. */
type Claim = { start: number; end: number; value: number; scale: number; isClaim: boolean; kind?: NumberKind };

function findClaims(text: string): Claim[] {
  const claims: Claim[] = [];
  const covered: [number, number][] = [];
  const overlaps = (s: number, e: number) => covered.some(([cs, ce]) => s < ce && cs < e);

  // 1. Dates and system reference codes — mark exempt so their embedded
  // digit runs are never treated as prices.
  for (const m of text.matchAll(DATE)) covered.push([m.index, m.index + m[0].length]);
  for (const m of text.matchAll(REF_CODE)) covered.push([m.index, m.index + m[0].length]);

  // 2. Scaled compounds — evaluate the FULL value («۳۸ هزار و ۵۰۰» → 38500).
  // Scale words in this domain are overwhelmingly money-denominated.
  for (const m of text.matchAll(SCALED)) {
    const s = m.index;
    const e = s + m[0].length;
    if (overlaps(s, e)) continue;
    const head = parseNumericToken(m[1]!);
    const scale = SCALE_VALUE[m[2]!]!;
    let value = head * scale;
    if (m[3]) value += parseNumericToken(m[3]) * (m[4] ? SCALE_VALUE[m[4]]! : 1);
    if (Number.isFinite(value)) {
      const tail = text.slice(e, e + 14);
      const kind = new RegExp(`^${J}${WEIGHT_UNIT}`).test(tail) ? 'weight' : 'money';
      claims.push({ start: s, end: e, value, scale, isClaim: true, kind });
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
    claims.push({ start: s, end: e, value, scale: 1, isClaim, kind: claimKind(tail) });
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
 * tool ledger (of the SAME kind — money can't be validated by a real weight
 * that coincidentally shares the numeral) or in the user's own messages.
 * Ungrounded ones are replaced.
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
        ? ledger.hasNear(c.value, c.scale, c.kind) || userNumbers.has(rounded)
        : ledger.has(rounded, c.kind) || userNumbers.has(rounded);
    if (!ok) {
      violations.push(rounded);
      cuts.push({ start: c.start, end: c.end });
    }
  }

  // Spelled-out money/weight with no digits is never grounded — censor the
  // phrase outright (-1 marks a word-form violation so the retry still triggers).
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

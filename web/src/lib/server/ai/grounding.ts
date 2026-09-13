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

/**
 * J-216. Normalized form used for BOTH storing a product identity and
 * scanning the model's sentence for it. Persian is written inconsistently —
 * «ذوب‌آهن» with a ZWNJ in the catalog, «ذوب آهن» with a space in the
 * answer; Persian digits in one place, Latin in the other — so a raw
 * `includes` would miss the match that matters and silently fail open.
 */
function foldChars(s: string): string {
  // LENGTH-PRESERVING on purpose: the sentence scan below matches refs by
  // offset against the original text's claim spans, so a fold that added or
  // removed characters would shift every position.
  return normalizeDigits(s).replace(/‌/g, ' ');
}

export function normalizeRef(s: string): string {
  return foldChars(s).replace(/\s+/g, ' ').trim();
}

/** Identities shorter than this are too generic to attribute anything with:
 *  «ورق» appears inside half the catalog's names. */
const MIN_REF_LENGTH = 4;

/** The identifying fields a tool result uses for a row. `name` first — it is
 *  the one the model actually writes in Persian prose, and therefore the only
 *  one a sentence scan can find. */
const IDENTITY_KEYS = ['name', 'slug', 'skuId', 'productName', 'product'] as const;

function identitiesOf(value: Record<string, unknown>): string[] {
  return IDENTITY_KEYS.map((k) => value[k])
    .filter((v): v is string => typeof v === 'string')
    .map(normalizeRef)
    .filter((v) => v.length >= MIN_REF_LENGTH);
}

export class GroundingLedger {
  private byNum = new Map<number, Set<NumberKind>>();
  /** J-216: which row each number came from. Parallel to `byNum` rather than
   *  folded into it so `has`/`hasNear` — the hot path, and the one every
   *  existing test pins — keep their exact previous behaviour. */
  private refsByNum = new Map<number, Set<string>>();
  /** Every identity this turn's tools mentioned, for deciding whether a
   *  sentence names a product we actually know about. */
  private allRefs = new Set<string>();

  /** Record one grounded number (tool output or a code-computed derivative).
   *  `sourceRefs` are the identities of the row it belongs to. */
  add(n: number, kind: NumberKind = 'other', sourceRefs: readonly string[] = []): void {
    if (!Number.isFinite(n)) return;
    const r = Math.round(n);
    const set = this.byNum.get(r) ?? new Set<NumberKind>();
    set.add(kind);
    this.byNum.set(r, set);
    if (sourceRefs.length === 0) return;
    const refs = this.refsByNum.get(r) ?? new Set<string>();
    for (const ref of sourceRefs) {
      refs.add(ref);
      this.allRefs.add(ref);
    }
    this.refsByNum.set(r, refs);
  }

  addAll(
    ns: Iterable<number>,
    kind: NumberKind = 'other',
    sourceRefs: readonly string[] = [],
  ): void {
    for (const n of ns) this.add(n, kind, sourceRefs);
  }

  /** Recursively record every number in a tool's JSON result, tagging each by
   *  its field name (e.g. `rebarKg` → weight, `rebarCost`/`price` → money) and
   *  by the identity of the nearest enclosing row (J-216). */
  addFromJson(value: unknown, keyHint?: string, sourceRefs: readonly string[] = []): void {
    if (typeof value === 'number') this.add(value, kindFromKey(keyHint), sourceRefs);
    // Tool-returned STRINGS are tool data too: a guide excerpt (searchGuides)
    // carries its figures as prose, and quoting a number the tool itself
    // returned must never be censored. This only widens the ledger's INPUT
    // (what a tool actually said) — the validator gate itself is untouched.
    else if (typeof value === 'string')
      this.addAll(numbersInText(value), kindFromKey(keyHint), sourceRefs);
    else if (Array.isArray(value)) value.forEach((v) => this.addFromJson(v, keyHint, sourceRefs));
    else if (value && typeof value === 'object') {
      const row = value as Record<string, unknown>;
      // An object that names a product REPLACES the inherited identity: this
      // is the row the numbers below it belong to. One that doesn't (a
      // wrapper like `{results: […]}`) passes the parent's through.
      const own = identitiesOf(row);
      const refs = own.length > 0 ? own : sourceRefs;
      Object.entries(row).forEach(([k, v]) => this.addFromJson(v, k, refs));
    }
  }

  /** J-216: which rows a value belongs to, scale-tolerant like `hasNear`.
   *  Empty means "no row claims this number" — a total, a count, a figure
   *  from guide prose — and attribution is then not checkable. */
  refsFor(value: number, scale = 1): ReadonlySet<string> {
    const out = new Set<string>();
    const r = Math.round(value);
    for (const ref of this.refsByNum.get(r) ?? []) out.add(ref);
    if (scale > 1) {
      for (const [n, refs] of this.refsByNum) {
        if (Math.abs(n - r) < scale) for (const ref of refs) out.add(ref);
      }
    }
    return out;
  }

  /** Every product identity this turn's tools returned. */
  get knownRefs(): ReadonlySet<string> {
    return this.allRefs;
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
// J-218: this system stores and quotes exclusively in تومان (see CLAUDE.md
// §1, "Localization: ... Toman currency") — ریال never legitimately labels a
// real price here. Accepting it as an interchangeable money unit would let a
// grounded Toman figure be relabeled ریال (a 10x understatement of its real
// Rial value) and pass validation untouched, since only the NUMBER was ever
// checked against the ledger, never the currency word attached to it.
const RIAL_TAIL = new RegExp(`^${J}ریال`);
const WEIGHT_UNIT = '(?:کیلوگرم|کیلو(?!متر)|گرم)';
// J-221: a percentage was never a "claim" at all below SIGNIFICANT_MIN (1000)
// — so an invented «۵۰٪ تخفیف» sailed through untouched, since 50 is neither
// money nor weight nor large enough to trigger the size-based claim check on
// its own. Any number the model attaches a percent sign/word to is now a
// claim needing grounding regardless of size. A REAL percentage (e.g. a
// price's movementPct) is already in the ledger tagged 'other', which an
// unspecified-kind check (see `has()`) matches — so this costs nothing for
// legitimate percentages and only catches invented ones.
const PERCENT_UNIT = '(?:%|٪|درصد)';
/** Units that make ANY attached number a money/weight/percent claim. */
const CLAIM_UNIT = new RegExp(
  `^${J}(هزار|میلیون|میلیارد|${MONEY_UNIT.slice(3, -1)}|${WEIGHT_UNIT.slice(3, -1)}|${PERCENT_UNIT.slice(3, -1)})`,
);
/** Digit-less spelled-out money/weight («چهل و دو هزار تومان», «پانصد تومان»,
 *  «صد کیلوگرم») — the prompt requires digits, so ANY word-number directly
 *  attached to a money/weight unit is censored outright, scale word or not. */
const WORD_NUM =
  '(?:یک|دو|سه|چهار|پنج|شش|شیش|هفت|هشت|نه|ده|یازده|دوازده|سیزده|چهارده|پانزده|شانزده|هفده|هجده|نوزده|بیست|سی|چهل|پنجاه|شصت|هفتاد|هشتاد|نود|صد|دویست|سیصد|چهارصد|پانصد|ششصد|هفتصد|هشتصد|نهصد)';
const WORD_MONEY = new RegExp(
  `${WORD_NUM}(?:${J}و${J}${WORD_NUM})*(?:${J}(?:هزار|میلیون|میلیارد))?${J}(?:${MONEY_UNIT}|${WEIGHT_UNIT})`,
  'g',
);

const SCALE_VALUE: Record<string, number> = {
  هزار: 1_000,
  میلیون: 1_000_000,
  میلیارد: 1_000_000_000,
};

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
type Claim = {
  start: number;
  end: number;
  value: number;
  scale: number;
  isClaim: boolean;
  kind?: NumberKind;
  /** J-218: attached to the literal word «ریال» — always censored, since this
   *  system never legitimately quotes in Rial (see RIAL_TAIL above). */
  rial?: boolean;
  /** End offset including the matched «ریال» word itself, so censoring a rial
   *  claim removes the wrong currency word too, not just the number in front
   *  of it (leaving "«...» ریال است" would still assert the wrong currency). */
  rialEnd?: number;
};

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
      const rialMatch = RIAL_TAIL.exec(tail);
      claims.push({
        start: s,
        end: e,
        value,
        scale,
        isClaim: true,
        kind,
        rial: Boolean(rialMatch),
        rialEnd: rialMatch ? e + rialMatch[0].length : undefined,
      });
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
    const rialMatch = RIAL_TAIL.exec(tail);
    claims.push({
      start: s,
      end: e,
      value,
      scale: 1,
      isClaim,
      kind: claimKind(tail),
      rial: Boolean(rialMatch),
      rialEnd: rialMatch ? e + rialMatch[0].length : undefined,
    });
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
  /** J-216: values that were REAL but attached to the wrong product. A subset
   *  of `violations` (they are censored the same way); reported separately
   *  because they mean something different — not invention, misattribution —
   *  and the retry prompt can say so. */
  misattributed?: number[];
}

/** The span of the sentence a claim sits in. Attribution is a sentence-level
 *  question: «میلگرد ۱۴ ذوب‌آهن ۴۲٬۵۰۰ تومان است.» names its own subject, and
 *  a price two sentences away has nothing to do with it. */
function sentenceSpan(text: string, start: number, end: number): [number, number] {
  const BOUNDARY = /[.!?\n؟؛]/;
  let s = start;
  while (s > 0 && !BOUNDARY.test(text[s - 1]!)) s--;
  let e = end;
  while (e < text.length && !BOUNDARY.test(text[e]!)) e++;
  return [s, e];
}

/**
 * J-216: is this (genuinely grounded) number attached to the wrong product?
 *
 * The rule is PROXIMITY, not mere co-occurrence: a number belongs to the
 * product named nearest to it within its own sentence. A single sentence
 * routinely covers two rows — «میلگرد ۱۴ ذوب‌آهن ۴۲۵۰۰ تومان است و نیشابور
 * ۴۱۸۰۰ تومان» — and asking only "is any owner named anywhere in this
 * sentence?" would wave through the version with the two figures swapped,
 * which is precisely the mistake worth catching.
 *
 * Fires only on positive evidence: the number belongs to at least one known
 * row, a known product is named in the sentence, and the nearest one is not
 * an owner. Everything else — an unattributed total, a sentence naming
 * nothing, a name the model phrased differently enough not to match — fails
 * open, because a false censor (a correct answer replaced by «قیمت دقیق را
 * کارشناس اعلام می‌کند») costs more than the rare coincidence this catches.
 */
function isMisattributed(folded: string, c: Claim, ledger: GroundingLedger): boolean {
  const owners = ledger.refsFor(c.value, c.scale);
  if (owners.size === 0) return false;

  const [ss, se] = sentenceSpan(folded, c.start, c.end);
  let nearest: { ref: string; distance: number } | null = null;
  for (const ref of ledger.knownRefs) {
    for (let i = folded.indexOf(ref, ss); i !== -1 && i < se; i = folded.indexOf(ref, i + 1)) {
      const end = i + ref.length;
      if (end > se) break;
      const distance = i >= c.end ? i - c.end : c.start >= end ? c.start - end : 0;
      // Ties go to the owner: «میلگرد ۱۴ ذوب‌آهن» and «میلگرد ۱۴» can both
      // match at the same offset, and the longer, more specific name is the
      // one the sentence actually means.
      if (
        !nearest ||
        distance < nearest.distance ||
        (distance === nearest.distance && owners.has(ref))
      ) {
        nearest = { ref, distance };
      }
    }
  }
  return nearest !== null && !owners.has(nearest.ref);
}

/**
 * Enforce AC-D-3 on a final answer: every significant number must exist in the
 * tool ledger (of the SAME kind — money can't be validated by a real weight
 * that coincidentally shares the numeral) or in the user's own messages.
 * Ungrounded ones are replaced.
 *
 * J-216 adds a second question after "is this number real?": "is it real FOR
 * THE PRODUCT THIS SENTENCE NAMES?". Two SKUs at the same price made the
 * first check unable to tell «میلگرد ۱۴ ذوب‌آهن ۴۲٬۵۰۰ تومان» from «میلگرد
 * ۱۴ نیشابور ۴۲٬۵۰۰ تومان» when only one of them was — the number really is
 * in the ledger, just for the other row.
 */
export function sanitizeGrounded(
  text: string,
  ledger: GroundingLedger,
  userNumbers: ReadonlySet<number>,
): SanitizeResult {
  const violations: number[] = [];
  const misattributed: number[] = [];
  const cuts: { start: number; end: number }[] = [];
  // Same length as `text`, so every claim offset stays valid (J-216).
  const folded = foldChars(text);

  for (const c of findClaims(text)) {
    if (!c.isClaim) continue;
    const rounded = Math.round(c.value);
    // J-218: a ریال-labeled figure is never valid here regardless of whether
    // the bare number is grounded — the number IS real (as a Toman price),
    // but the currency word attached to it is always wrong, which the
    // ledger's number-only check can't see on its own.
    const ok =
      !c.rial &&
      (c.scale > 1
        ? ledger.hasNear(c.value, c.scale, c.kind) || userNumbers.has(rounded)
        : ledger.has(rounded, c.kind) || userNumbers.has(rounded));
    if (!ok) {
      violations.push(rounded);
      cuts.push({ start: c.start, end: c.rial && c.rialEnd ? c.rialEnd : c.end });
      continue;
    }
    // Grounded, but possibly against the wrong row (J-216).
    if (isMisattributed(folded, c, ledger)) {
      violations.push(rounded);
      misattributed.push(rounded);
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

  if (cuts.length === 0) return { text, violations, misattributed };

  cuts.sort((a, b) => b.start - a.start);
  let out = text;
  for (const { start, end } of cuts)
    out = out.slice(0, start) + UNGROUNDED_REPLACEMENT + out.slice(end);
  return { text: out, violations, misattributed };
}

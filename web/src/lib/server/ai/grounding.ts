/**
 * Grounding ledger + post-generation numeric validator (acceptance-criteria AC-D-3).
 *
 * Every number a tool returns is recorded in a per-request ledger. Before any
 * model text reaches the user, `sanitizeGrounded` scans it: a "significant"
 * number (price/weight/cost-sized, or one glued to a money/weight unit) that
 * was NOT produced by a tool and NOT typed by the user is replaced with a
 * «کارشناس اعلام می‌کند» placeholder — the model is never allowed to invent one.
 * Pure functions; unit-tested.
 */
import { normalizeDigits } from '@/lib/utils/format';

export class GroundingLedger {
  private nums = new Set<number>();

  /** Record one grounded number (tool output or a code-computed derivative). */
  add(n: number): void {
    if (!Number.isFinite(n)) return;
    const r = Math.round(n);
    this.nums.add(r);
    // Persian copy quotes prices as «N هزار/میلیون تومان» — allow the scaled forms.
    if (r >= 10_000 && r % 1000 === 0) this.nums.add(r / 1000);
    if (r >= 10_000_000 && r % 1_000_000 === 0) this.nums.add(r / 1_000_000);
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

  get size(): number {
    return this.nums.size;
  }
}

/** Numeric token in text: Persian/Latin digits with optional ،٬, separators + decimals. */
const NUM_TOKEN = /[\d۰-۹][\d۰-۹٬،,]*(?:[.٫][\d۰-۹]+)?/g;

/** Units/scales that make ANY attached number a claim needing grounding —
 * including «هزار/میلیون تومان», so a small scaled price can't slip through. */
const CLAIM_UNIT = /^\s*(هزار|میلیون|میلیارد|تومان|ریال|کیلوگرم|کیلو(?!متر)|گرم)/;

export function parseNumericToken(token: string): number {
  const cleaned = normalizeDigits(token).replace(/[٬،,]/g, '').replace('٫', '.');
  return Number(cleaned);
}

/** All numbers the user themself typed (their own inputs are never "invented"). */
export function numbersInText(text: string): number[] {
  const out: number[] = [];
  for (const m of normalizeDigits(text).matchAll(NUM_TOKEN)) {
    const n = parseNumericToken(m[0]);
    if (Number.isFinite(n)) out.push(Math.round(n));
  }
  return out;
}

export const UNGROUNDED_REPLACEMENT = '«قیمت دقیق را کارشناس اعلام می‌کند»';

/** A number is a "claim" if it is price/weight-sized or glued to a money/weight unit. */
const SIGNIFICANT_MIN = 1000;

export interface SanitizeResult {
  text: string;
  /** Numbers that had to be censored — non-empty means the model tried to invent. */
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
  const out = text.replace(NUM_TOKEN, (token, offset: number, whole: string) => {
    const n = parseNumericToken(token);
    if (!Number.isFinite(n)) return token;
    const rounded = Math.round(n);
    const tail = whole.slice(offset + token.length, offset + token.length + 12);
    const isClaim = rounded >= SIGNIFICANT_MIN || CLAIM_UNIT.test(tail);
    if (!isClaim) return token; // sizes, floors, counts, percentages — fine
    if (ledger.has(rounded) || userNumbers.has(rounded)) return token;
    violations.push(rounded);
    return UNGROUNDED_REPLACEMENT;
  });
  return { text: out, violations };
}

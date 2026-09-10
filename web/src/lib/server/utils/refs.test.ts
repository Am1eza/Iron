/** E-105: the ref suffix is the actual unguessability guarantee behind every
 *  public capability lookup (`/api/track/[ref]`, `/api/proforma/[ref]`) — see
 *  the SECURITY comment in refs.ts. This asserts the real entropy of newly
 *  generated refs arithmetically (so a future edit to the alphabet or length
 *  can't silently regress it back below a defensible bar) and that the
 *  generator actually produces strings matching that math, not just that the
 *  constants look right on paper.
 */
import { describe, it, expect } from 'vitest';
import { REF_SUFFIX_ALPHABET, REF_SUFFIX_LENGTH, randomRefSuffix, nextRef } from './refs';
import { createOrder, findOrderByRef } from '@/lib/server/repos/ordersRepo';
import { createTestDb } from '@/test/db';

describe('ref suffix entropy (E-105)', () => {
  it('the alphabet has no visually-ambiguous characters (0/O, 1/I/L, U)', () => {
    for (const ambiguous of ['0', 'O', '1', 'I', 'L', 'U']) {
      expect(REF_SUFFIX_ALPHABET).not.toContain(ambiguous);
    }
    // No duplicates either — a repeated symbol would silently shrink the
    // real alphabet size below what the entropy math below assumes.
    expect(new Set(REF_SUFFIX_ALPHABET.split('')).size).toBe(REF_SUFFIX_ALPHABET.length);
  });

  it('computes to at least ~55 bits of entropy for a newly generated ref, comfortably above the old (flagged) ~29.4 bits', () => {
    const bitsPerChar = Math.log2(REF_SUFFIX_ALPHABET.length);
    const totalBits = bitsPerChar * REF_SUFFIX_LENGTH;
    // The old, audit-flagged design: 6 chars over this same alphabet.
    const oldTotalBits = bitsPerChar * 6;
    expect(oldTotalBits).toBeCloseTo(29.4, 1);
    expect(totalBits).toBeGreaterThanOrEqual(55);
  });

  it('randomRefSuffix() produces strings of the configured length, drawn only from the safe alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const suffix = randomRefSuffix();
      expect(suffix).toHaveLength(REF_SUFFIX_LENGTH);
      for (const ch of suffix) expect(REF_SUFFIX_ALPHABET).toContain(ch);
    }
  });

  it('randomRefSuffix() is not observably biased toward any one symbol (basic sanity, not a full statistical test)', () => {
    const counts = new Map<string, number>();
    const samples = 6000;
    for (let i = 0; i < samples; i++) {
      for (const ch of randomRefSuffix()) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    }
    const totalChars = samples * REF_SUFFIX_LENGTH;
    const expected = totalChars / REF_SUFFIX_ALPHABET.length;
    for (const symbol of REF_SUFFIX_ALPHABET) {
      const seen = counts.get(symbol) ?? 0;
      // Loose bound (±40% of expected) — this is a smoke test for a broken
      // modulo/mapping, not a chi-squared randomness proof.
      expect(seen).toBeGreaterThan(expected * 0.6);
      expect(seen).toBeLessThan(expected * 1.4);
    }
  });

  it('two calls essentially never collide (birthday-bound sanity at this sample size)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) seen.add(randomRefSuffix());
    expect(seen.size).toBe(5000);
  });

  it('nextRef() mints a ref whose random suffix is REF_SUFFIX_LENGTH long, and old shorter refs remain valid lookup keys by plain string match', async () => {
    const { close } = await createTestDb();
    try {
      const ref = await nextRef('OR', new Date('2026-09-11T00:00:00Z'));
      const parts = ref.split('-');
      const suffix = parts[parts.length - 1]!;
      expect(suffix).toHaveLength(REF_SUFFIX_LENGTH);

      // Backward compatibility, proven end-to-end (not just asserted): ref
      // lookup is a plain equality match on the `ref` column with no length
      // assumption anywhere, so a legacy order minted before this widening —
      // simulated here with its real old 6-char-suffix shape — must still
      // resolve through the exact same public lookup path new refs use.
      const legacyRef = 'OR-14050620-0001-K7X9AB';
      expect(legacyRef.split('-').pop()).toHaveLength(6);
      await createOrder({ ref: legacyRef, items: [] });
      const found = await findOrderByRef(legacyRef);
      expect(found?.ref).toBe(legacyRef);
    } finally {
      await close();
    }
  });
});

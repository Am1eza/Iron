/**
 * J-219 — «query rewrite» detection.
 *
 * This feeds a RATE on the admin usage console, and a rate is only worth
 * looking at if its false-positive floor is near zero: a counter that fires
 * on every ordinary turn would make a non-problem look like an emergency and
 * bury the real signal. So most of these tests are negatives — the normal
 * ways a tool query legitimately differs from the visitor's exact words.
 */
import { describe, it, expect } from 'vitest';
import { addedQueryTokens, rewrittenTokensForCall } from './queryRewrite';

describe('addedQueryTokens — what the model added that nobody typed', () => {
  it('catches a factory the model supplied itself', () => {
    // The visitor asked an AMBIGUOUS question; the model narrowed it to one
    // row on its own, which is exactly the bypass the audit describes.
    expect(addedQueryTokens('میلگرد ۱۴ ذوب‌آهن', ['قیمت میلگرد ۱۴ چند است؟'])).toEqual(['ذوبآهن']);
  });

  it('says nothing when the query only echoes the visitor', () => {
    expect(addedQueryTokens('میلگرد ۱۴', ['قیمت میلگرد ۱۴ چند است؟'])).toEqual([]);
  });

  it('accepts a factory carried forward from an earlier turn', () => {
    // «و نیشابورش چند؟» three messages later is correct behaviour, not an
    // invention — which is why the baseline is the whole user transcript.
    expect(
      addedQueryTokens('میلگرد ۱۶ نیشابور', ['میلگرد نیشابور دارید؟', 'قیمت سایز ۱۶ چند است؟']),
    ).toEqual([]);
  });

  it('is not fooled by Persian vs Latin digits', () => {
    expect(addedQueryTokens('میلگرد 14', ['قیمت میلگرد ۱۴؟'])).toEqual([]);
  });

  it('is not fooled by a ZWNJ or a space inside a compound', () => {
    expect(addedQueryTokens('تیرآهن ۱۸', ['قیمت تیر آهن ۱۸ چند؟'])).toEqual([]);
    expect(addedQueryTokens('ذوب آهن', ['میلگرد ذوب‌آهن می‌خواهم'])).toEqual([]);
  });

  it('ignores punctuation differences', () => {
    expect(addedQueryTokens('میلگرد ۱۴', ['«میلگرد ۱۴»؟'])).toEqual([]);
  });

  it('ignores tokens too short to mean anything', () => {
    // «یک» and «تا» match by accident constantly; aiTools#resolveProduct
    // applies the same threshold for the same reason.
    expect(addedQueryTokens('یک تا میلگرد', ['میلگرد می‌خواهم'])).toEqual([]);
  });

  it('counts an empty query as nothing rather than as a rewrite', () => {
    expect(addedQueryTokens('', ['میلگرد'])).toEqual([]);
    expect(addedQueryTokens('   ', ['میلگرد'])).toEqual([]);
  });

  it('treats a substring of what the visitor typed as already said', () => {
    expect(addedQueryTokens('میلگرد', ['میلگرد۱۴ دارید؟'])).toEqual([]);
  });
});

describe('rewrittenTokensForCall — across a tool call’s query-ish args', () => {
  const SAID = ['قیمت میلگرد ۱۴ چند است؟'];

  it('unions the added tokens from every query-ish argument', () => {
    const added = rewrittenTokensForCall({ query: 'میلگرد ۱۴ ذوب‌آهن', size: '۱۴' }, SAID);
    expect(added).toEqual(['ذوبآهن']);
  });

  it('ignores non-string and unrelated arguments', () => {
    // `qty` is a number and `unit` is not a product query — neither can be a
    // "rewrite", and counting them would inflate the rate on every proforma.
    expect(rewrittenTokensForCall({ query: 'میلگرد ۱۴', qty: 3000, unit: 'kg' }, SAID)).toEqual([]);
  });

  it('returns nothing for a tool called with no query at all', () => {
    expect(rewrittenTokensForCall({}, SAID)).toEqual([]);
  });
});

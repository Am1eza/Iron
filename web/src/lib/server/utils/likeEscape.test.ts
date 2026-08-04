import { describe, it, expect } from 'vitest';
import { escapeLike, likeContains } from './likeEscape';

describe('escapeLike', () => {
  it('leaves ordinary text (incl. Persian) untouched', () => {
    expect(escapeLike('میلگرد ۱۴')).toBe('میلگرد ۱۴');
    expect(escapeLike('')).toBe('');
    expect(escapeLike('A3')).toBe('A3');
  });

  it('escapes the % wildcard — the full-table-scan / match-everything case', () => {
    expect(escapeLike('%')).toBe('\\%');
    expect(escapeLike('50%')).toBe('50\\%');
    expect(escapeLike('%_%_%')).toBe('\\%\\_\\%\\_\\%');
  });

  it('escapes the _ single-char wildcard', () => {
    // The real report: the size «40_40» matched «40x40».
    expect(escapeLike('40_40')).toBe('40\\_40');
  });

  it('escapes a literal backslash BEFORE it can escape the next char', () => {
    // A single pass over one character class is what makes this hold: with
    // three sequential replaces, `\%` would become `\\\%` in one order and a
    // working escape sequence in another.
    expect(escapeLike('\\')).toBe('\\\\');
    expect(escapeLike('\\%')).toBe('\\\\\\%');
    // …so the user's backslash stays a literal backslash and the user's `%`
    // stays a literal `%`: neither can escape the other.
    expect(escapeLike('a\\_b')).toBe('a\\\\\\_b');
  });

  it('is idempotent-safe in the sense that double-escaping never re-enables a wildcard', () => {
    const once = escapeLike('%');
    const twice = escapeLike(once);
    expect(twice).toBe('\\\\\\%'); // literal backslash + literal percent — still not a wildcard
  });
});

describe('likeContains', () => {
  it('wraps in %…% with only the OUTER percents left as wildcards', () => {
    expect(likeContains('میلگرد')).toBe('%میلگرد%');
    expect(likeContains('50%')).toBe('%50\\%%');
    expect(likeContains('40_40')).toBe('%40\\_40%');
  });

  it('an all-wildcard query still produces a bounded literal pattern', () => {
    // Before the fix this was `%%%%%%` — a guaranteed full scan matching every
    // row. Now the inner metacharacters are literal, so it matches nothing
    // unless a row genuinely contains «%_%».
    expect(likeContains('%_%')).toBe('%\\%\\_\\%%');
  });
});

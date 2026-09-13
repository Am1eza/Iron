/**
 * J-245, the residual half: a name belonging to someone who is not the
 * account holder. There is no record to match it against, so the only honest
 * signal is the text labelling it AS a name.
 *
 * Half of these tests are negatives, and they matter more than the positives:
 * corrections and eval candidates ARE the training corpus, so a heuristic
 * that redacted «فولاد مبارکه» out of «فاکتور به نام فولاد مبارکه» would
 * destroy the thing it was added to protect.
 */
import { describe, it, expect } from 'vitest';
import { scrubIntroducedNames, scrubKnownNames } from './piiScrub';

describe('scrubIntroducedNames — names the text labels as names', () => {
  // The honorific stays: it is not PII, and keeping it makes the redaction
  // legible to whoever reads the correction later.
  it('redacts a third party behind an honorific', () => {
    expect(scrubIntroducedNames('لطفاً با آقای رضایی هماهنگ کنید.')).toBe(
      'لطفاً با آقای [redacted-name] هماهنگ کنید.',
    );
    expect(scrubIntroducedNames('فاکتور به نام خانم کریمی صادر شود')).toBe(
      'فاکتور به نام خانم [redacted-name] صادر شود',
    );
  });

  it('redacts a two-part name whole, not just its first half', () => {
    const out = scrubIntroducedNames('با آقای علی رضایی تماس بگیرید');
    expect(out).toBe('با آقای [redacted-name] تماس بگیرید');
    expect(out).not.toContain('رضایی');
  });

  it('skips an inner title and still catches the name behind it', () => {
    expect(scrubIntroducedNames('آقای مهندس رضایی گفتند')).toBe('آقای مهندس [redacted-name] گفتند');
  });

  it('catches a self-introduction', () => {
    expect(scrubIntroducedNames('اسم من علی رضایی است')).toBe('اسم من [redacted-name] است');
    expect(scrubIntroducedNames('نامم رضا')).toBe('نامم [redacted-name]');
    expect(scrubIntroducedNames('my name is Ali Rezaei and I need rebar')).toBe(
      'my name is [redacted-name] and I need rebar',
    );
  });

  it('keeps a politeness marker instead of redacting it as a name', () => {
    expect(scrubIntroducedNames('آقای عزیز، قیمت را بفرمایید')).toBe('آقای عزیز، قیمت را بفرمایید');
    expect(scrubIntroducedNames('خانم محترم سلام')).toBe('خانم محترم سلام');
  });

  it('trims a trailing politeness word off a captured name', () => {
    expect(scrubIntroducedNames('آقای رضایی عزیز')).toBe('آقای [redacted-name] عزیز');
  });

  it('leaves ordinary business text alone — the corpus is the point', () => {
    const untouched = [
      'قیمت میلگرد ۱۴ ذوب‌آهن اصفهان چند است؟',
      'فاکتور به نام شرکت فولاد مبارکه صادر شود',
      'تیرآهن ۱۸ ذوب آهن را برای کارگاه لازم دارم',
      'باربری تا انبار شهرک صنعتی چقدر می‌شود؟',
    ];
    for (const t of untouched) expect(scrubIntroducedNames(t)).toBe(t);
  });
});

describe('scrubKnownNames — the account holder', () => {
  it('redacts the longest form first so no half survives', () => {
    const out = scrubKnownNames('سلام، علی رضایی هستم و علی را صدا بزنید', [
      'علی رضایی',
      'رضایی',
      'علی',
    ]);
    expect(out).toBe('سلام، [redacted-name] هستم و [redacted-name] را صدا بزنید');
  });

  it('is a no-op with no known names', () => {
    expect(scrubKnownNames('متن', [])).toBe('متن');
  });
});

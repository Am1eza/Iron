/**
 * AI_SYSTEM_PROMPT — the house rules that were observed being broken in
 * production, pinned so they can't be dropped in a future edit of a 20-rule
 * prompt string.
 *
 * All three came out of a real conversation driven against production on
 * 2026-08-17 (see .claude/audits/ai-page-audit.md):
 *
 *  - The advisor told a customer «پرداخت و ارسال فاکتور پس از تأیید نهایی
 *    انجام خواهد شد.» There is no online payment — the single most locked
 *    product decision in the repo. The preamble mentioned it as background;
 *    no rule ever forbade promising a payment step.
 *  - It told the customer to press a button called «ثبت نهایی». No such
 *    button exists; the card's control is «تأیید و ثبت درخواست», or «ورود به
 *    حساب کاربری» for a guest — which is what that visitor was actually shown.
 *  - It wrote product names in ASCII double quotes, in a document whose every
 *    other quotation uses «».
 */
import { describe, it, expect } from 'vitest';
import { AI_SYSTEM_PROMPT } from './aiTools';

describe('AI_SYSTEM_PROMPT — house rules observed broken in production', () => {
  it('forbids describing any payment step', () => {
    expect(AI_SYSTEM_PROMPT).toContain('هرگز از پرداخت حرف نزن');
    // The reason, not just the ban — the model needs to know what DOES happen.
    expect(AI_SYSTEM_PROMPT).toContain('کارشناس فروش تماس می‌گیرد');
  });

  it('gives the confirm card’s real button labels so none get invented', () => {
    expect(AI_SYSTEM_PROMPT).toContain('تأیید و ثبت درخواست');
    expect(AI_SYSTEM_PROMPT).toContain('ورود به حساب کاربری');
  });

  it('says out loud that this site has no password or username', () => {
    // Added 2026-08-18: the advisor invented a whole credential step for a
    // real visitor («نام کاربری یا رمز عبور را در اینجا ننویسید»). Unlike the
    // payment and filing claims, this one broke no rule — there was no rule.
    // Login is mobile+OTP; answerGuard.stripFalseProcessClaims is the floor
    // under this, and this is the rule it is a floor under.
    expect(AI_SYSTEM_PROMPT).toContain('کد پیامکی یکبارمصرف');
    expect(AI_SYSTEM_PROMPT).toContain('هرگز از رمز یا نام کاربری حرف نزن');
  });

  it('requires Persian guillemets rather than ASCII quotes', () => {
    expect(AI_SYSTEM_PROMPT).toContain('گیومهٔ فارسی');
  });

  it('still carries the rules that were already correct', () => {
    // Grounding, the no-em-dash rule, and Persian-only output. Regression
    // guards: this prompt is one long template literal and easy to truncate.
    expect(AI_SYSTEM_PROMPT).toContain('هیچ قیمت، وزن یا عددی را از خودت نساز');
    expect(AI_SYSTEM_PROMPT).toContain('هرگز از خط تیرهٔ بلند');
    expect(AI_SYSTEM_PROMPT).toContain('پاسخ فقط و فقط فارسی باشد');
    expect(AI_SYSTEM_PROMPT).toContain('هرگز نگو «درخواستت ثبت شد»');
  });

  /**
   * The one rule that was deliberately RELAXED (US-05.7), and therefore the
   * one most worth pinning. The old text was a blanket «هرگز پیش‌بینی قطعی
   * نده», which the model satisfied by refusing to have a view at all — and
   * «بخرم یا صبر کنم؟» is the question every steel buyer actually asks. The
   * replacement permits exactly one thing (relaying forecastPrice's
   * directional call) and keeps the ban on everything that made the original
   * rule necessary. If a future edit drops either half, these fail.
   */
  describe('the price-outlook rule — permission and prohibition together', () => {
    it('still forbids a price for a future date, in those words', () => {
      expect(AI_SYSTEM_PROMPT).toContain('هرگز قیمت مشخصی برای تاریخ آینده نگو');
      expect(AI_SYSTEM_PROMPT).toContain('مطلقاً ممنوع');
    });

    it('still forbids the words that turn an estimate into a promise', () => {
      for (const word of ['قطعاً', 'حتماً', 'تضمین می‌کنم']) {
        expect(AI_SYSTEM_PROMPT).toContain(word);
      }
    });

    it('forbids the model having a view of its own, separately from the tool', () => {
      expect(AI_SYSTEM_PROMPT).toContain('هرگز از خودت دربارهٔ آیندهٔ قیمت حرف نزن');
    });

    it('names the tool that IS allowed to answer, so refusal is not the default', () => {
      expect(AI_SYSTEM_PROMPT).toContain('forecastPrice');
      expect(AI_SYSTEM_PROMPT).toContain('الان بخرم یا صبر کنم؟');
    });

    it('requires the caveat and the no-history honesty every time', () => {
      expect(AI_SYSTEM_PROMPT).toContain('برآورد جهت‌دار');
      expect(AI_SYSTEM_PROMPT).toContain('سابقهٔ قیمتی کافی نیست');
    });
  });

  it('names the forbidden punctuation so the ban is unambiguous', () => {
    // The prompt necessarily CONTAINS the characters it forbids — it quotes
    // them to point at them. What matters is that each ban still names its
    // character rather than gesturing at "bad punctuation".
    expect(AI_SYSTEM_PROMPT).toContain('خط تیرهٔ بلند («—»)');
    expect(AI_SYSTEM_PROMPT).toContain('گیومهٔ لاتین');
  });
});

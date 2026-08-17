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

  it('names the forbidden punctuation so the ban is unambiguous', () => {
    // The prompt necessarily CONTAINS the characters it forbids — it quotes
    // them to point at them. What matters is that each ban still names its
    // character rather than gesturing at "bad punctuation".
    expect(AI_SYSTEM_PROMPT).toContain('خط تیرهٔ بلند («—»)');
    expect(AI_SYSTEM_PROMPT).toContain('گیومهٔ لاتین');
  });
});

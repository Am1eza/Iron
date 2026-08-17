/**
 * ONE register across everything the advisor says.
 *
 * The live audit (.claude/audits/ai-page-audit.md, proposal PR-B) found the
 * page speaking in two voices at once: the UI's own copy is informal تو
 * («کمکت می‌کنم», «برمی‌گردی»), matching the brand book's «دوستِ کاربلد
 * بازار», while every model answer came back formal شما («کنید», «شما»,
 * «می‌خواهید») — adjacent, in the same card. The owner chose تو.
 *
 * The model's own output can only be steered by the prompt (rules 21 and 22)
 * and verified live. Everything else the advisor says is a fixed string, and
 * fixed strings can be pinned — which is what this does, because a formal
 * greeting or error line would put شما right back next to a تو answer.
 */
import { describe, it, expect } from 'vitest';
import { AI_SYSTEM_PROMPT } from '@/lib/server/services/aiTools';
import { GREETING_REPLY } from './greeting';
import { AI_UNAVAILABLE_MESSAGE, AI_ERROR_MESSAGE, LEAD_CONFIRM_MESSAGES } from './messages';
import { formalMarkersIn } from '@/test/persianRegister';

describe('the advisor speaks in one register (تو), everywhere it speaks', () => {
  const CASES: [string, string][] = [
    ['the canned greeting reply', GREETING_REPLY],
    ['the "advisor unavailable" message', AI_UNAVAILABLE_MESSAGE],
    ['the pipeline-error message', AI_ERROR_MESSAGE],
    ...Object.entries(LEAD_CONFIRM_MESSAGES).map(
      ([k, v]) => [`the lead-confirm ${k} message`, v] as [string, string],
    ),
  ];

  it.each(CASES)('%s uses no formal second-person form', (_label, text) => {
    expect(formalMarkersIn(text)).toEqual([]);
  });

  it('keeps the greeting a real introduction, not just an informal one', () => {
    // Register is the change; the content it carried must survive it.
    expect(GREETING_REPLY).toContain('مشاور هوشمند');
    expect(GREETING_REPLY).toContain('پیش‌فاکتور');
    expect(GREETING_REPLY).toMatch(/می‌خواهی/);
  });

  it('still points at the human path when the advisor is unavailable', () => {
    expect(AI_UNAVAILABLE_MESSAGE).toContain('کارشناسان ما');
    expect(AI_UNAVAILABLE_MESSAGE).toContain('درخواست مشاوره ثبت کن');
  });
});

describe('AI_SYSTEM_PROMPT — the تو rule the model is held to', () => {
  it('states the rule, in both directions', () => {
    expect(AI_SYSTEM_PROMPT).toContain('با کاربر همیشه با «تو» حرف بزن، نه با «شما»');
    expect(AI_SYSTEM_PROMPT).toContain('دوم‌شخص مفرد');
  });

  it('holds the register even when the user writes formally', () => {
    // The observed failure mode is mirroring: a formal question gets a formal
    // answer, so the register becomes the visitor's choice rather than the
    // brand's.
    expect(AI_SYSTEM_PROMPT).toContain('حتی وقتی کاربر خودش با «شما» می‌نویسد');
  });

  it('gives before/after examples, the way the other drift-prone rules do', () => {
    // Same technique rule 19 uses for the em-dash: name the wrong form, show
    // the right one. A rule stated only in the abstract drifts back under
    // pressure.
    expect(AI_SYSTEM_PROMPT).toContain('نمونه (نادرست ← درست)');
    expect(AI_SYSTEM_PROMPT).toContain('«بگو چه سایزی می‌خواهی.»');
    expect(AI_SYSTEM_PROMPT).toContain('«اگر بخواهی، پیش‌فاکتور را آماده می‌کنم.»');
  });

  it('bounds the informality — B2B steel buying, not casual chat', () => {
    expect(AI_SYSTEM_PROMPT).toContain('صمیمیِ حرفه‌ای');
    for (const word of ['داداش', 'عزیزم', 'جانم']) expect(AI_SYSTEM_PROMPT).toContain(word);
    expect(AI_SYSTEM_PROMPT).toContain('شکسته‌نویسی');
  });

  it('does not disturb the grounding and payment rules it sits after', () => {
    expect(AI_SYSTEM_PROMPT).toContain('هیچ قیمت، وزن یا عددی را از خودت نساز');
    expect(AI_SYSTEM_PROMPT).toContain('هرگز از پرداخت حرف نزن');
    expect(AI_SYSTEM_PROMPT).toContain('پاسخ فقط و فقط فارسی باشد');
  });
});

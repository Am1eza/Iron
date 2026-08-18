// @vitest-environment node
/**
 * selectFollowUpChips — the deterministic post-turn chip picker used by
 * /api/ai/chat. Had zero coverage twice in a row (evals.test.ts drives
 * runAdvisorPipeline directly and never touches the route that calls this),
 * and both times the gap was the same shape: a tool that genuinely answered
 * the turn wasn't in the "don't re-show the starter chips" check, so its
 * answer looked like nothing had happened yet.
 */
import { describe, it, expect } from 'vitest';
import { selectFollowUpChips, CHIP, PURPOSE_CHIPS } from './aiTaxonomy';

describe('selectFollowUpChips', () => {
  it('offers proforma + all-prices after getPrice/calcWeight/compareFactories', () => {
    for (const tool of ['getPrice', 'calcWeight', 'compareFactories']) {
      expect(selectFollowUpChips(new Set([tool]), 1, 'قیمت میلگرد چنده؟')).toEqual([
        CHIP.proforma,
        CHIP.allPrices,
      ]);
    }
  });

  // The estimate branch is the one place the picker reads the tool's RESULT
  // and not just its name. It used to offer «وزن دقیق را حساب کن» under a
  // project estimate — a tool of no use to someone who has just been handed
  // four tonnages — while the obvious next step, all of it on a پیش‌فاکتور,
  // was not on offer at all.
  it('offers the whole itemised list on a پیش‌فاکتور after a project estimate', () => {
    expect(
      selectFollowUpChips(new Set(['estimateProject']), 1, 'یه خونه می‌سازم', undefined, {
        hasOrderableLines: true,
        assumedTotalArea: true,
      }),
    ).toEqual([CHIP.proformaAll, CHIP.perFloorArea]);
  });

  it('offers the area correction as a tap, because that assumption is the likeliest to be wrong', () => {
    const chips = selectFollowUpChips(new Set(['estimateProject']), 1, 'زیربنای ۵۰۰ متر، ۶ طبقه', undefined, {
      hasOrderableLines: true,
      assumedTotalArea: true,
    });
    expect(chips).toContain(CHIP.perFloorArea);
  });

  it('only offers a factory comparison when there are live prices to compare', () => {
    const priced = selectFollowUpChips(new Set(['estimateProject']), 1, 'خونه', undefined, {
      hasOrderableLines: true,
      hasPrices: true,
      assumedTotalArea: false,
    });
    expect(priced).toEqual([CHIP.proformaAll, CHIP.compareFactories]);

    const unpriced = selectFollowUpChips(new Set(['estimateProject']), 1, 'خونه', undefined, {
      hasOrderableLines: true,
      hasPrices: false,
      assumedTotalArea: false,
    });
    expect(unpriced).toEqual([CHIP.proformaAll, CHIP.allPrices]);
  });

  it('falls back to the plain proforma chip when the estimate produced nothing orderable', () => {
    expect(selectFollowUpChips(new Set(['estimateProject']), 1, 'یه خونه می‌سازم')).toEqual([
      CHIP.proforma,
      CHIP.allPrices,
    ]);
  });

  // The confirmation card rendered by that same turn already carries the one
  // next step (confirm, or sign in) — a chip beside it duplicates the action.
  it('offers no chips after prepareProforma — the confirmation card IS the next step', () => {
    expect(selectFollowUpChips(new Set(['prepareProforma']), 2, 'پیش‌فاکتور می‌خوام')).toEqual([]);
    expect(selectFollowUpChips(new Set(['getPrice', 'prepareProforma']), 2, 'پیش‌فاکتور می‌خوام')).toEqual([]);
  });

  it('offers no chips after searchGuides — a knowledge answer, not a pricing one', () => {
    expect(selectFollowUpChips(new Set(['searchGuides']), 1, 'فرق A2 و A3 چیه؟')).toEqual([]);
  });

  // PR-C: when the advisor asks «کدام کارخانه؟», the answers are the chips.
  // Anything else on that turn would be a chip for a question nobody asked.
  it('offers the pending choice as chips, ahead of every generic follow-up', () => {
    const options = ['میلگرد آجدار ۱۶ فایکو', 'میلگرد آجدار ۱۶ ذوب‌آهن اصفهان'];
    expect(
      selectFollowUpChips(new Set(['prepareProforma']), 2, 'پیش‌فاکتور میلگرد ۱۶', options),
    ).toEqual(options);
    // Even on a turn that would otherwise have produced the pricing pair.
    expect(
      selectFollowUpChips(new Set(['getPrice', 'prepareProforma']), 2, 'میلگرد ۱۶', options),
    ).toEqual(options);
  });

  it('falls back to the normal chips when there is no pending choice', () => {
    expect(selectFollowUpChips(new Set(['prepareProforma']), 2, 'پیش‌فاکتور', [])).toEqual([]);
    expect(selectFollowUpChips(new Set(['getPrice']), 2, 'قیمت میلگرد', undefined)).toEqual([
      CHIP.proforma,
      CHIP.allPrices,
    ]);
  });

  it('shows the starter chips on a genuinely unanswered first turn (no tool used)', () => {
    expect(selectFollowUpChips(new Set(), 1, 'سلام')).toEqual([...PURPOSE_CHIPS]);
  });

  it('does not re-show the starter chips when the first message WAS one of them', () => {
    const clicked = PURPOSE_CHIPS[0]!;
    expect(selectFollowUpChips(new Set(), 1, clicked)).toEqual([]);
  });

  it('does not show the starter chips past the first turn even with no tool used', () => {
    expect(selectFollowUpChips(new Set(), 2, 'خب پس چیکار کنم؟')).toEqual([]);
  });
});

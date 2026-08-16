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

  it('offers proforma + weigh-tool after estimateProject/createLead', () => {
    for (const tool of ['estimateProject', 'createLead']) {
      expect(selectFollowUpChips(new Set([tool]), 1, 'یه خونه می‌سازم')).toEqual([
        CHIP.proforma,
        CHIP.weighTool,
      ]);
    }
  });

  it('offers no chips after searchGuides — a knowledge answer, not a pricing one', () => {
    expect(selectFollowUpChips(new Set(['searchGuides']), 1, 'فرق A2 و A3 چیه؟')).toEqual([]);
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

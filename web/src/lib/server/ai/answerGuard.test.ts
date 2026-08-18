// @vitest-environment node
/**
 * looksLikeLeakedReasoning — the guard between a reasoning model's scratchpad
 * and a customer's screen.
 *
 * The positive case is real: this text was rendered in the advisor's own chat
 * bubble on production, 2026-08-17, on a proforma turn. The negative cases
 * matter just as much — a guard that eats legitimate answers would replace a
 * good answer with an outage notice, which is a worse trade than the leak it
 * prevents.
 */
import { describe, it, expect } from 'vitest';
import { collapseImmediateRepeat, looksLikeLeakedReasoning } from './answerGuard';

const LEAKED = `We need to respond to user. The user wants to proceed with a proforma for ۳ tons of ۱۶mm rebar, but the system says product not found with that exact name. We need to ask user to specify product name more precisely, using Persian name. Also we must follow style: use "تو" etc. Also we must not reveal internal tool calls.`;

describe('looksLikeLeakedReasoning', () => {
  it('catches the leak that actually shipped', () => {
    expect(looksLikeLeakedReasoning(LEAKED)).toBe(true);
  });

  it('catches a short leak that names the rules it is weighing', () => {
    // Under the eight-word bar, but the marker plus English prose is enough.
    expect(looksLikeLeakedReasoning('The user asks for a price. We must use tool.')).toBe(true);
  });

  it('leaves a normal Persian answer alone', () => {
    expect(
      looksLikeLeakedReasoning(
        'قیمت امروز میلگرد ۱۶ ذوب‌آهن اصفهان ۴۲٬۵۰۰ تومان بر کیلوگرم است. اگر بخواهی، پیش‌فاکتور را همین‌جا آماده می‌کنم.',
      ),
    ).toBe(false);
  });

  it('leaves an answer full of Latin grade codes alone', () => {
    // The exact vocabulary rule 16 tells the model to use: grades and section
    // codes in backticks. Every one of these is 1-2 letters plus digits.
    expect(
      looksLikeLeakedReasoning(
        'برای خاموت `A2` و برای اسکلت `A3` مناسب‌تر است؛ ورق `ST37` و تیرآهن `IPE14` هم موجود است. وزن بر حسب kg و ابعاد بر حسب mm اعلام می‌شود.',
      ),
    ).toBe(false);
  });

  it('leaves a markdown comparison table alone', () => {
    expect(
      looksLikeLeakedReasoning(
        '| کارخانه | قیمت هر کیلو | جمع |\n| --- | --- | --- |\n| ذوب‌آهن | ۴۲٬۵۰۰ | ۸۵٬۰۰۰٬۰۰۰ |\n| فایکو | ۴۳٬۱۰۰ | ۸۶٬۲۰۰٬۰۰۰ |',
      ),
    ).toBe(false);
  });

  it('is quiet on empty or whitespace text', () => {
    // An empty answer is handled as its own case upstream; the guard must not
    // claim a leak it cannot see.
    expect(looksLikeLeakedReasoning('')).toBe(false);
    expect(looksLikeLeakedReasoning('   \n ')).toBe(false);
  });
});

describe('collapseImmediateRepeat', () => {
  it('collapses the stutter that reached a customer', () => {
    // Reported live on 2026-08-18. Note the first copy ends «آهن‌» with a
    // trailing ZWNJ (the signature of a clause cut mid-word and restarted),
    // so the comparison has to ignore ZWNJ and the SECOND copy has to be the
    // one kept.
    expect(collapseImmediateRepeat('بگو چه گریدی از آهن‌ چه گریدی از آهن می‌خواهی')).toBe(
      'بگو چه گریدی از آهن می‌خواهی',
    );
  });

  it('collapses a whole repeated sentence and keeps the rest of the text', () => {
    const doubled =
      'قیمت امروز میلگرد ۱۶ ثبت نشده است. قیمت امروز میلگرد ۱۶ ثبت نشده است. کارشناس اعلام می‌کند.';
    expect(collapseImmediateRepeat(doubled)).toBe(
      'قیمت امروز میلگرد ۱۶ ثبت نشده است. کارشناس اعلام می‌کند.',
    );
  });

  it('never joins across a line break', () => {
    // Two list items that happen to start alike are not a stutter.
    const list = '- میلگرد ۱۴ آجدار ابهر\n- میلگرد ۱۴ آجدار ابهر';
    expect(collapseImmediateRepeat(list)).toBe(list);
  });

  it('leaves a markdown table row alone', () => {
    const row = '| ذوب‌آهن اصفهان | ۴۲٬۵۰۰ | ذوب‌آهن اصفهان | ۴۲٬۵۰۰ |';
    expect(collapseImmediateRepeat(row)).toBe(row);
  });

  it('leaves short or non-adjacent repeats alone', () => {
    // Two words is emphasis, not a stutter…
    expect(collapseImmediateRepeat('خیلی خیلی زود')).toBe('خیلی خیلی زود');
    // …and a phrase that recurs later in the sentence is ordinary Persian.
    const normal = 'میلگرد ۱۴ آجدار داریم و میلگرد ۱۴ آجدار موجود است.';
    expect(collapseImmediateRepeat(normal)).toBe(normal);
  });

  it('leaves a repeated run of bare numbers alone', () => {
    // Sizes and counts legitimately repeat; only a lettered clause counts.
    expect(collapseImmediateRepeat('۱۲ ۱۴ ۱۶ ۱۲ ۱۴ ۱۶')).toBe('۱۲ ۱۴ ۱۶ ۱۲ ۱۴ ۱۶');
  });

  it('leaves a normal answer completely untouched', () => {
    const answer =
      'قیمت امروز میلگرد ۱۶ ذوب‌آهن اصفهان ۴۲٬۵۰۰ تومان بر کیلوگرم است. اگر بخواهی، پیش‌فاکتور را همین‌جا آماده می‌کنم.';
    expect(collapseImmediateRepeat(answer)).toBe(answer);
  });

  it('handles empty and single-word text', () => {
    expect(collapseImmediateRepeat('')).toBe('');
    expect(collapseImmediateRepeat('سلام')).toBe('سلام');
  });
});

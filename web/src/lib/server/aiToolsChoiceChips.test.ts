// @vitest-environment node
/**
 * chipsForChoice — which «کدام کارخانه؟» answers become tappable chips.
 *
 * The pure half of PR-C (the end-to-end behaviour is an eval scenario against
 * the real pipeline and a seeded DB — see evals.test.ts). What matters here is
 * the two ways emitting chips could actively mislead: options belonging to two
 * different products in one undifferentiated row, and a row long enough that
 * it stops reading as a question with answers.
 */
import { describe, it, expect } from 'vitest';
import { chipsForChoice } from '@/lib/server/services/aiTools';

const REBAR = ['میلگرد آجدار ۱۶ فایکو', 'میلگرد آجدار ۱۶ ذوب‌آهن اصفهان', 'میلگرد آجدار ۱۶ ظفر بناب'];

describe('chipsForChoice', () => {
  it('turns the options of a single ambiguous line into chips, in order', () => {
    expect(chipsForChoice([{ product: 'میلگرد ۱۶', options: REBAR }])).toEqual(REBAR);
  });

  it('emits nothing for two ambiguous lines — a chip would answer an unasked question', () => {
    // Two products, one chip row: tapping «میلگرد آجدار ۱۶ فایکو» says nothing
    // about the تیرآهن line, and the visitor cannot tell which line they just
    // answered. The model asks in prose instead, as it always did.
    expect(
      chipsForChoice([
        { product: 'میلگرد ۱۶', options: REBAR },
        { product: 'تیرآهن ۱۴', options: ['تیرآهن ۱۴ ذوب‌آهن', 'تیرآهن ۱۴ ناب تبریز'] },
      ]),
    ).toEqual([]);
  });

  it('emits nothing when there is no ambiguity at all', () => {
    expect(chipsForChoice([])).toEqual([]);
  });

  it('caps the row at five and drops duplicates', () => {
    const many = Array.from({ length: 9 }, (_, i) => `میلگرد ۱۶ کارخانهٔ ${i}`);
    expect(chipsForChoice([{ product: 'میلگرد', options: many }])).toHaveLength(5);
    // Chip labels are React keys in the thread — a duplicate would collide.
    const dupes = ['میلگرد ۱۶ فایکو', 'میلگرد ۱۶ فایکو', 'میلگرد ۱۶ ابهر'];
    expect(chipsForChoice([{ product: 'میلگرد', options: dupes }])).toEqual([
      'میلگرد ۱۶ فایکو',
      'میلگرد ۱۶ ابهر',
    ]);
  });

  it('drops blank options rather than rendering an empty button', () => {
    expect(chipsForChoice([{ product: 'میلگرد', options: ['  ', 'میلگرد ۱۶ ابهر', ''] }])).toEqual([
      'میلگرد ۱۶ ابهر',
    ]);
  });
});

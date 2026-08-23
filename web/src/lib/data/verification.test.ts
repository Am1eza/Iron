/**
 * The verification "why bother" copy is a PROMISE the sales team has to keep
 * on the phone. Level 3 used to advertise «قیمت و شرایط عمده‌فروشی» and
 * «امکان خرید اعتباری» while the product had neither a tier-pricing mechanism
 * nor a credit limit anywhere in the codebase — a verified customer who called
 * and asked for their wholesale price found there wasn't one.
 *
 * This test is the guard: no level may advertise a price, discount, credit or
 * volume-tier benefit until such a mechanism actually exists. If you are here
 * because this test failed, the fix is to build the mechanism (an owner
 * decision — pricing is admin-entered by design), not to loosen the list.
 */
import { describe, it, expect } from 'vitest';
import { BUSINESS_ACCOUNT_LABEL, LEVEL_INFO } from './verification';

/** Words that would each amount to a money promise the site cannot honour. */
const MONEY_CLAIMS = [
  'تخفیف', // discount
  'درصد', // percent
  'عمده‌فروشی', // wholesale (pricing/terms)
  'عمده فروشی',
  'اعتباری', // credit purchase
  'قیمت ویژه', // special price
  'ارزان',
];

describe('LEVEL_INFO copy', () => {
  it('promises no price, discount or credit benefit at any level', () => {
    for (const info of Object.values(LEVEL_INFO)) {
      for (const line of info.unlocks) {
        for (const claim of MONEY_CLAIMS) {
          expect(line, `«${line}» (سطح ${info.level})`).not.toContain(claim);
        }
      }
    }
  });

  it('names the verified-business badge with the one shared label', () => {
    expect(LEVEL_INFO[3].unlocks.some((u) => u.includes(BUSINESS_ACCOUNT_LABEL))).toBe(true);
  });
});

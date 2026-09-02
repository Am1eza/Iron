/**
 * What a returning customer is greeted with.
 *
 * The interesting property is not the SQL (covered by leadsRepo) — it is the
 * shape of the sentence. A history line that reads as a fact sheet gets
 * ignored; one that says «offer them the repeat» changes the first turn. And
 * the city has to be framed as a default to CONFIRM: people buy for more than
 * one site, and quietly pricing freight to last month's address is exactly the
 * silent assumption that becomes a wrong quote.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const leadsForUser = vi.fn();
const leadItemsOfMany = vi.fn();
vi.mock('@/lib/server/repos/leadsRepo', () => ({
  leadsForUser: (...a: unknown[]) => leadsForUser(...a),
  leadItemsOfMany: (...a: unknown[]) => leadItemsOfMany(...a),
}));

import { customerHistoryFact, getCustomerHistory } from './customerFacts';

const USER = { id: 'u1', mobile: '09120000000' };

beforeEach(() => {
  leadsForUser.mockReset();
  leadItemsOfMany.mockReset();
});

describe('getCustomerHistory', () => {
  it('is null for a guest — nothing is read without a session', async () => {
    expect(await getCustomerHistory(null)).toBeNull();
    expect(leadsForUser).not.toHaveBeenCalled();
  });

  it('is null for a signed-in customer with no history', async () => {
    leadsForUser.mockResolvedValue({ rows: [], hasMore: false });
    expect(await getCustomerHistory(USER)).toBeNull();
  });

  it('collects distinct product names, newest request first', async () => {
    leadsForUser.mockResolvedValue({
      rows: [
        { id: 'l1', context: null },
        { id: 'l2', context: null },
      ],
      hasMore: false,
    });
    leadItemsOfMany.mockResolvedValue(
      new Map([
        ['l1', [{ name: 'میلگرد ۱۴ ذوب‌آهن' }, { name: 'میلگرد ۱۶ ذوب‌آهن' }]],
        // A repeat buyer orders the same thing; it must appear once.
        ['l2', [{ name: 'میلگرد ۱۴ ذوب‌آهن' }, { name: 'تیرآهن ۱۴' }]],
      ]),
    );
    const history = await getCustomerHistory(USER);
    expect(history!.products).toEqual(['میلگرد ۱۴ ذوب‌آهن', 'میلگرد ۱۶ ذوب‌آهن', 'تیرآهن ۱۴']);
  });

  it('takes the city from the most recent request that recorded one', async () => {
    leadsForUser.mockResolvedValue({
      rows: [
        { id: 'l1', context: {} }, // newest, no city
        { id: 'l2', context: { deliveryCity: 'مشهد' } },
        { id: 'l3', context: { deliveryCity: 'تهران' } }, // older, must lose
      ],
      hasMore: false,
    });
    leadItemsOfMany.mockResolvedValue(new Map());
    expect((await getCustomerHistory(USER))!.city).toBe('مشهد');
  });

  it('never throws — an unreadable history just means a normal conversation', async () => {
    leadsForUser.mockRejectedValue(new Error('db down'));
    expect(await getCustomerHistory(USER)).toBeNull();
  });
});

describe('customerHistoryFact', () => {
  it('says nothing when there is nothing to say', () => {
    expect(customerHistoryFact(null)).toBeNull();
    expect(customerHistoryFact({ products: [], requestCount: 0 })).toBeNull();
  });

  it('tells the advisor to OFFER the repeat, not merely to know about it', () => {
    const line = customerHistoryFact({
      products: ['میلگرد ۱۴ ذوب‌آهن'],
      requestCount: 2,
    })!;
    expect(line).toContain('میلگرد ۱۴ ذوب‌آهن');
    expect(line).toContain('از صفر نپرس');
  });

  it('frames the remembered city as a default to CONFIRM, never to assume', () => {
    const line = customerHistoryFact({ products: [], city: 'مشهد', requestCount: 1 })!;
    expect(line).toContain('مشهد');
    expect(line).toContain('تأیید');
    // The specific harm: silently pricing freight to a city they did not
    // choose this time.
    expect(line).toContain('بدون تأیید، کرایهٔ حمل را روی آن حساب نکن');
  });

  it('carries no identity — product names and a city, nothing else', () => {
    const line = customerHistoryFact({
      products: ['میلگرد ۱۴'],
      city: 'تهران',
      requestCount: 3,
    })!;
    expect(line).not.toMatch(/09\d|۰۹/);
  });
});

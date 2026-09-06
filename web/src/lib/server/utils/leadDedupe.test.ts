import { describe, expect, it } from 'vitest';
import { leadDedupeFingerprint } from './leadDedupe';

const base = {
  contact: { mobile: '09120000000', name: 'خریدار' },
  items: [{ skuId: 'rebar-14', qty: 20, unit: 'kg' as const, quotedUnitPrice: 42_000 }],
  channel: 'sms',
};

describe('leadDedupeFingerprint', () => {
  it('is order-independent for identical cart lines', () => {
    const second = { ...base, items: [...base.items, { skuId: 'beam-16', qty: 2, unit: 'branch' as const }] };
    expect(leadDedupeFingerprint(second)).toBe(leadDedupeFingerprint({ ...second, items: [...second.items].reverse() }));
  });

  it('distinguishes kg from branch and price snapshots', () => {
    expect(leadDedupeFingerprint(base)).not.toBe(leadDedupeFingerprint({ ...base, items: [{ ...base.items[0]!, unit: 'branch' }] }));
    expect(leadDedupeFingerprint(base)).not.toBe(leadDedupeFingerprint({ ...base, items: [{ ...base.items[0]!, quotedUnitPrice: 43_000 }] }));
  });
});

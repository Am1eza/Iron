import { describe, expect, it } from 'vitest';
import { DEFAULT_FREIGHT_TABLE } from '@/lib/data/logistics';
import { logisticsSettingSchema } from '@/lib/validation/settingsSchemas';

describe('LOGISTICS settings contract', () => {
  it('accepts the exact current admin-form payload including the freight table', () => {
    const parsed = logisticsSettingSchema.safeParse({
      originLabel: 'انبار شادآباد تهران',
      freightTable: DEFAULT_FREIGHT_TABLE,
      handlingPerTon: 150_000,
      insuranceRate: 0.0025,
      scaleFee: 75_000,
      packagingPerTon: 0,
      taxable: { goods: true, freight: false, handling: false, insurance: false, scale: false, packaging: false },
      sourceNote: 'تأیید تلفنی شریک حمل در ۱۴۰۵/۰۶/۱۳',
      cities: [{ name: 'تهران', km: 20 }],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.freightTable).toEqual(DEFAULT_FREIGHT_TABLE);
  });

  it('rejects an unverifiable save with no source note', () => {
    const parsed = logisticsSettingSchema.safeParse({
      originLabel: 'انبار', freightTable: DEFAULT_FREIGHT_TABLE,
      handlingPerTon: 0, insuranceRate: 0, scaleFee: 0, packagingPerTon: 0,
      taxable: { goods: true, freight: false, handling: false, insurance: false, scale: false, packaging: false },
      sourceNote: '', cities: [],
    });
    expect(parsed.success).toBe(false);
  });
});

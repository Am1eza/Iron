import { z } from 'zod';
import { finiteNumber } from './utils';

export const logisticsSettingSchema = z.object({
  originLabel: z.string().max(120),
  freightTable: z.array(z.object({
    km: finiteNumber.positive().max(100_000),
    perTon: finiteNumber.positive().max(1e13),
  })).min(2).max(100),
  freightRatePerTonKm: finiteNumber.positive().max(1_000_000_000).optional(),
  freightMinTrip: finiteNumber.positive().max(1e13).optional(),
  handlingPerTon: finiteNumber.min(0).max(1e13),
  insuranceRate: finiteNumber.min(0).max(0.2),
  scaleFee: finiteNumber.min(0).max(1e13),
  packagingPerTon: finiteNumber.min(0).max(1e13),
  taxable: z.object({
    goods: z.boolean(), freight: z.boolean(), handling: z.boolean(),
    insurance: z.boolean(), scale: z.boolean(), packaging: z.boolean(),
  }),
  sourceNote: z.string().trim().min(1).max(500),
  verifiedAt: z.string().datetime().optional(),
  cities: z.array(z.object({ name: z.string().max(60), km: finiteNumber.min(0).max(100_000) })).max(200),
}).superRefine((value, ctx) => {
  for (let index = 1; index < value.freightTable.length; index++) {
    if (value.freightTable[index]!.km <= value.freightTable[index - 1]!.km) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['freightTable', index, 'km'], message: 'فاصله‌ها باید صعودی و یکتا باشند.' });
    }
  }
});

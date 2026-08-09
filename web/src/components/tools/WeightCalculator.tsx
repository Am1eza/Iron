'use client';
import { useMemo, useState } from 'react';
import { useCartStore } from '@/lib/stores/cart';
import { useToast } from '@/lib/hooks/useToast';
import { routes } from '@/lib/routes';
import { toPersianDigits, normalizeDigits } from '@/lib/utils/format';
import { unitWeightKg, IBEAM_KG_PER_M, CHANNEL_KG_PER_M, ANGLE_KG_PER_M } from '@/lib/utils/weight';
import { Card, Stack, Cluster, Text, Alert } from '@/components/ui';
import { Button } from '@/components/ui';
import { PlusIcon, CheckCircleIcon, ChevronDownIcon } from '@/components/primitives/icons';
import styles from './WeightCalculator.module.css';

/**
 * وزن‌سنج — theoretical (markazeahan-style) weight for the main steel sections.
 * Steel density 7.85 g/cm³. All math is deterministic; inputs accept Persian
 * digits and are normalized before parsing. The exact formula used is always
 * shown so the result is auditable.
 *
 * The arithmetic itself lives in `lib/utils/weight.ts` — the SAME module the
 * وزن‌سنج API route and the AI advisor's calcWeight tool call. This page used
 * to carry its own copy, which is how the site could quote a customer one
 * weight here and a different one in chat. What stays local is presentation:
 * which fields to ask for, the Persian formula string shown underneath, and
 * (audit-2026-08-09) a static reference table per profile — see
 * `REFERENCE_TABLES` below.
 *
 * audit-2026-08-08/09: this used to have one combined «نبشی/تسمه» tab whose
 * hint claimed to cover BOTH a flat bar and an equal-leg angle, but only ever
 * ran the flat-bar formula — split into two honest tabs. Added «تیرآهن»/
 * «ناودانی» (mill-table lookups, already supported by `weight.ts`/the AI
 * advisor but never exposed here). Then cross-checked every shape against
 * مرکزآهن's published جدول‌وزن pages (Amir's explicit request) — تیرآهن/
 * ناودانی's tables and نبشی's standard sizes were updated in `weight.ts` to
 * match their published numbers exactly; «نبشی» switched from free-dimension
 * input to a catalog-size select (like ibeam/channel), since the geometric
 * approximation drifted up to ~5% for larger legs — bigger than a customer
 * comparing against the bazaar reference should see.
 */

type Profile = 'rebar' | 'plate' | 'pipe' | 'flat' | 'angle' | 'ibeam' | 'channel';

type Field = {
  key: string;
  label: string;
  unit: string;
  placeholder: string;
  /** 'select' for mill-table sizes (ibeam/channel/angle) — a free-text mm/m
   *  value has no meaning there, only the published size codes do. */
  type?: 'text' | 'select';
  options?: { value: string; label: string }[];
};

/** Fully generic — plate's real published table (t/w/L/weight-per-sheet, no
 *  "per meter" column since a sheet isn't a length-sold product) needs a
 *  different shape from the bar/profile shapes, so this doesn't force one. */
type ReferenceTable = {
  headers: string[];
  rows: string[][];
};

type ProfileSpec = {
  key: Profile;
  label: string;
  /** Persian description of the section. */
  hint: string;
  fields: Field[];
  /** kg per شاخه (a single piece) given parsed inputs, or null if incomplete
   *  or geometrically invalid. */
  perPiece: (v: Record<string, number>) => number | null;
  /** Human-readable formula, with the live values substituted in. */
  formula: (v: Record<string, number>) => string;
  /** Whether the piece result is "per meter" (everything except plate) or
   *  absolute (plate). */
  perMeter: boolean;
  pieceWord: string; // شاخه | برگ
  /** Static published-size reference table shown under the calculator,
   *  matching مرکزآهن's own جدول‌وزن pages — Amir's explicit request
   *  (2026-08-09) after a page-by-page formula comparison against them. */
  referenceTable?: ReferenceTable;
};

const sizeOptions = (table: Readonly<Record<string, number>>) =>
  Object.keys(table)
    .map(Number)
    .sort((a, b) => a - b)
    .map((n) => ({ value: String(n), label: toPersianDigits(n) }));

/** Standard thickness that ships with each published نبشی leg size — display
 *  only (the live calc reads the weight straight from `ANGLE_KG_PER_M`). */
const ANGLE_STANDARD_THICKNESS_MM: Readonly<Record<string, number>> = {
  '30': 3, '40': 4, '50': 5, '60': 6, '70': 7, '80': 8, '100': 10, '120': 12,
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Common shape for every bar/profile table: size label, weight/metre, weight
 *  for one standard branch. Plate (sold by the sheet, not the metre) builds
 *  its own table below instead of using this helper. */
function perMeterTable(
  sizeHeader: string,
  branchM: number,
  sizes: number[],
  perMFor: (size: number) => number,
  labelFor: (size: number) => string = (s) => toPersianDigits(s),
): ReferenceTable {
  return {
    headers: [sizeHeader, 'وزن هر متر (kg)', `وزن شاخه ${toPersianDigits(branchM)} متری (kg)`],
    rows: sizes.map((s) => {
      const perM = round2(perMFor(s));
      return [labelFor(s), faNum(perM), faNum(round2(perM * branchM))];
    }),
  };
}

const REBAR_TABLE: ReferenceTable = perMeterTable(
  'قطر (mm)',
  12,
  [8, 10, 12, 14, 16, 18, 20, 22, 25, 28, 32],
  (d) => (d * d) / 162,
);

const PLATE_STANDARD_WIDTH_M = 1.5;
const PLATE_STANDARD_LENGTH_M = 6;
const PLATE_TABLE: ReferenceTable = {
  headers: ['ضخامت (mm)', 'عرض (m)', 'طول (m)', 'وزن هر برگ (kg)'],
  rows: [3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30].map((t) => {
    const w = round2(t * PLATE_STANDARD_WIDTH_M * PLATE_STANDARD_LENGTH_M * 7.85);
    return [
      toPersianDigits(t),
      toPersianDigits(PLATE_STANDARD_WIDTH_M),
      toPersianDigits(PLATE_STANDARD_LENGTH_M),
      faNum(w),
    ];
  }),
};

const PIPE_STANDARD_THICKNESS_MM = 2;
const PIPE_TABLE: ReferenceTable = perMeterTable(
  `قطر خارجی (mm)، ضخامت ${toPersianDigits(PIPE_STANDARD_THICKNESS_MM)}mm`,
  6,
  [21.3, 26.7, 33.4, 42.2, 48.3, 60.3, 73, 88.9, 114.3],
  (od) => (od - PIPE_STANDARD_THICKNESS_MM) * PIPE_STANDARD_THICKNESS_MM * 0.02466,
);

const FLAT_SIZES: [number, number][] = [
  [20, 3], [25, 3], [30, 3], [40, 4], [40, 5], [50, 5], [50, 6], [60, 6], [80, 8], [100, 10],
];
const FLAT_TABLE: ReferenceTable = {
  headers: ['عرض × ضخامت (mm)', 'وزن هر متر (kg)', 'وزن شاخه ۶ متری (kg)'],
  rows: FLAT_SIZES.map(([w, t]) => {
    const perM = round2(w * t * 0.00785);
    return [`${toPersianDigits(w)}×${toPersianDigits(t)}`, faNum(perM), faNum(round2(perM * 6))];
  }),
};

const ANGLE_TABLE: ReferenceTable = perMeterTable(
  'سایز (نبشی L×L×t)',
  6,
  Object.keys(ANGLE_KG_PER_M).map(Number).sort((a, b) => a - b),
  (leg) => ANGLE_KG_PER_M[String(leg)]!,
  (leg) => {
    const t = ANGLE_STANDARD_THICKNESS_MM[String(leg)] ?? 0;
    return `L${toPersianDigits(leg)}×${toPersianDigits(leg)}×${toPersianDigits(t)}`;
  },
);

const IBEAM_TABLE: ReferenceTable = perMeterTable(
  'سایز',
  12,
  Object.keys(IBEAM_KG_PER_M).map(Number).sort((a, b) => a - b),
  (size) => IBEAM_KG_PER_M[String(size)]!,
);

const CHANNEL_TABLE: ReferenceTable = perMeterTable(
  'سایز',
  6,
  Object.keys(CHANNEL_KG_PER_M).map(Number).sort((a, b) => a - b),
  (size) => CHANNEL_KG_PER_M[String(size)]!,
);

const PROFILES: ProfileSpec[] = [
  {
    key: 'rebar',
    label: 'میلگرد',
    hint: 'وزن هر متر میلگرد گرد بر اساس قطر اسمی.',
    perMeter: true,
    pieceWord: 'شاخه',
    fields: [
      { key: 'd', label: 'قطر', unit: 'میلی‌متر', placeholder: 'مثلاً ۱۴' },
      { key: 'len', label: 'طول هر شاخه', unit: 'متر', placeholder: 'مثلاً ۱۲' },
    ],
    perPiece: (v) => unitWeightKg('rebar', { diameterMm: v.d, lengthM: v.len }),
    formula: (v) => `(قطر² ÷ ۱۶۲) = (${toPersianDigits(v.d || 0)}² ÷ ۱۶۲)`,
    referenceTable: REBAR_TABLE,
  },
  {
    key: 'plate',
    label: 'ورق',
    hint: 'وزن یک برگ ورق بر اساس طول، عرض و ضخامت.',
    perMeter: false,
    pieceWord: 'برگ',
    fields: [
      { key: 'len', label: 'طول', unit: 'متر', placeholder: 'مثلاً ۶' },
      { key: 'w', label: 'عرض', unit: 'متر', placeholder: 'مثلاً ۱٫۲۵' },
      { key: 't', label: 'ضخامت', unit: 'میلی‌متر', placeholder: 'مثلاً ۳' },
    ],
    perPiece: (v) => unitWeightKg('plate', { lengthM: v.len, widthM: v.w, thicknessMm: v.t }),
    formula: (v) =>
      `طول × عرض × ضخامت × ۷٫۸۵ = ${toPersianDigits(v.len || 0)} × ${toPersianDigits(v.w || 0)} × ${toPersianDigits(v.t || 0)} × ۷٫۸۵`,
    referenceTable: PLATE_TABLE,
  },
  {
    key: 'pipe',
    label: 'لوله',
    hint: 'وزن هر متر لولهٔ فولادی بر اساس قطر خارجی و ضخامت جداره.',
    perMeter: true,
    pieceWord: 'شاخه',
    fields: [
      { key: 'od', label: 'قطر خارجی', unit: 'میلی‌متر', placeholder: 'مثلاً ۶۰' },
      { key: 't', label: 'ضخامت جداره', unit: 'میلی‌متر', placeholder: 'مثلاً ۳' },
      { key: 'len', label: 'طول هر شاخه', unit: 'متر', placeholder: 'مثلاً ۶' },
    ],
    perPiece: (v) =>
      unitWeightKg('pipe', { outerDiameterMm: v.od, thicknessMm: v.t, lengthM: v.len }),
    formula: (v) =>
      `(قطر خارجی − ضخامت) × ضخامت × ۰٫۰۲۴۶۶ = (${toPersianDigits(v.od || 0)} − ${toPersianDigits(v.t || 0)}) × ${toPersianDigits(v.t || 0)} × ۰٫۰۲۴۶۶`,
    referenceTable: PIPE_TABLE,
  },
  {
    key: 'flat',
    label: 'تسمه',
    hint: 'وزن هر متر تسمه (مقطع تخت مستطیلی) بر اساس عرض و ضخامت.',
    perMeter: true,
    pieceWord: 'شاخه',
    fields: [
      { key: 'w', label: 'عرض', unit: 'میلی‌متر', placeholder: 'مثلاً ۴۰' },
      { key: 't', label: 'ضخامت', unit: 'میلی‌متر', placeholder: 'مثلاً ۴' },
      { key: 'len', label: 'طول هر شاخه', unit: 'متر', placeholder: 'مثلاً ۶' },
    ],
    perPiece: (v) => unitWeightKg('flat', { widthMm: v.w, thicknessMm: v.t, lengthM: v.len }),
    formula: (v) =>
      `عرض × ضخامت × ۰٫۰۰۷۸۵ = ${toPersianDigits(v.w || 0)} × ${toPersianDigits(v.t || 0)} × ۰٫۰۰۷۸۵`,
    referenceTable: FLAT_TABLE,
  },
  {
    key: 'angle',
    label: 'نبشی',
    hint: 'وزن نبشی با بال‌های مساوی، بر اساس جدول سایزهای استاندارد بازار.',
    perMeter: true,
    pieceWord: 'شاخه',
    fields: [
      {
        key: 'size',
        label: 'سایز (طول بال)',
        unit: '',
        placeholder: '',
        type: 'select',
        options: sizeOptions(ANGLE_KG_PER_M),
      },
      { key: 'len', label: 'طول هر شاخه', unit: 'متر', placeholder: 'مثلاً ۶' },
    ],
    perPiece: (v) => unitWeightKg('angle', { sizeCode: v.size, lengthM: v.len }),
    formula: (v) => {
      const kgPerM = ANGLE_KG_PER_M[String(Math.round(v.size || 0))];
      const t = ANGLE_STANDARD_THICKNESS_MM[String(Math.round(v.size || 0))] ?? 0;
      return `طبق جدول استاندارد (نبشی L${toPersianDigits(v.size || 0)}×${toPersianDigits(v.size || 0)}×${toPersianDigits(t)}) = ${toPersianDigits(kgPerM ?? 0)}`;
    },
    referenceTable: ANGLE_TABLE,
  },
  {
    key: 'ibeam',
    label: 'تیرآهن',
    hint: 'وزن هر متر تیرآهن استاندارد، بر اساس جدول وزن کارخانه برای هر سایز بازاری.',
    perMeter: true,
    pieceWord: 'شاخه',
    fields: [
      {
        key: 'size',
        label: 'سایز',
        unit: '',
        placeholder: '',
        type: 'select',
        options: sizeOptions(IBEAM_KG_PER_M),
      },
      { key: 'len', label: 'طول هر شاخه', unit: 'متر', placeholder: 'مثلاً ۱۲' },
    ],
    perPiece: (v) => unitWeightKg('ibeam', { sizeCode: v.size, lengthM: v.len }),
    formula: (v) => {
      const kgPerM = IBEAM_KG_PER_M[String(Math.round(v.size || 0))];
      return `طبق جدول کارخانه (تیرآهن ${toPersianDigits(v.size || 0)}) = ${toPersianDigits(kgPerM ?? 0)}`;
    },
    referenceTable: IBEAM_TABLE,
  },
  {
    key: 'channel',
    label: 'ناودانی',
    hint: 'وزن هر متر ناودانی استاندارد، بر اساس جدول وزن کارخانه برای هر سایز بازاری.',
    perMeter: true,
    pieceWord: 'شاخه',
    fields: [
      {
        key: 'size',
        label: 'سایز',
        unit: '',
        placeholder: '',
        type: 'select',
        options: sizeOptions(CHANNEL_KG_PER_M),
      },
      { key: 'len', label: 'طول هر شاخه', unit: 'متر', placeholder: 'مثلاً ۶' },
    ],
    perPiece: (v) => unitWeightKg('channel', { sizeCode: v.size, lengthM: v.len }),
    formula: (v) => {
      const kgPerM = CHANNEL_KG_PER_M[String(Math.round(v.size || 0))];
      return `طبق جدول کارخانه (ناودانی ${toPersianDigits(v.size || 0)}) = ${toPersianDigits(kgPerM ?? 0)}`;
    },
    referenceTable: CHANNEL_TABLE,
  },
];

function parse(value: string): number {
  const n = Number(normalizeDigits(value).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Show up to 2 decimals, Persian digits, trimmed trailing zeros. */
function faNum(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  const str = rounded
    .toLocaleString('en-US', { maximumFractionDigits: 2 })
    .replace(/,/g, '٬');
  return toPersianDigits(str);
}

export function WeightCalculator() {
  const add = useCartStore((s) => s.add);
  const toast = useToast();

  const [profileKey, setProfileKey] = useState<Profile>('rebar');
  const [values, setValues] = useState<Record<string, string>>({});
  const [count, setCount] = useState('1');

  const profile = PROFILES.find((p) => p.key === profileKey) ?? PROFILES[0]!;

  const parsed = useMemo(() => {
    const out: Record<string, number> = {};
    for (const f of profile.fields) out[f.key] = parse(values[f.key] ?? '');
    return out;
  }, [profile, values]);

  const perPiece = profile.perPiece(parsed);
  const pieces = Math.max(1, Math.round(parse(count)) || 1);
  const total = perPiece !== null ? perPiece * pieces : null;

  // audit-2026-08-09: distinguishes "hasn't finished typing yet" from "typed
  // something, but it's geometrically impossible" (e.g. a pipe wall thicker
  // than its own outer diameter) — these used to share the exact same "enter
  // values" message even though every field was already filled, which left a
  // customer who'd made a real data-entry mistake with no idea why nothing
  // computed.
  const allFieldsGiven = profile.fields.every((f) => (parsed[f.key] ?? 0) > 0);
  const invalidGeometry = allFieldsGiven && perPiece === null;

  const setField = (key: string, val: string) =>
    setValues((prev) => ({ ...prev, [key]: val }));

  const switchProfile = (key: Profile) => {
    setProfileKey(key);
    setValues({});
  };

  const addToCart = () => {
    if (total === null || perPiece === null) return;
    add({
      skuId: `weight-calc-${profile.key}`,
      name: `${profile.label} (محاسبهٔ وزن‌سنج)`,
      qty: pieces,
      unit: profile.key === 'plate' ? 'sheet' : 'branch',
      weightKg: Math.round(perPiece * 100) / 100,
    });
    toast.success('نتیجهٔ محاسبه به سبد استعلام اضافه شد.', {
      label: 'مشاهده سبد',
      href: routes.cart(),
    });
  };

  return (
    <Stack gap={6}>
      {/* Profile selector — segmented */}
      <div
        className={styles.segmented}
        role="group"
        aria-label="نوع مقطع"
      >
        {PROFILES.map((p) => (
          <button
            key={p.key}
            type="button"
            aria-pressed={p.key === profileKey}
            className={styles.segment}
            data-active={p.key === profileKey ? '' : undefined}
            onClick={() => switchProfile(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className={styles.layout}>
        {/* Inputs */}
        <Card className={styles.panel}>
          <Stack gap={5}>
            <Text variant="body-sm" color="muted">
              {profile.hint}
            </Text>
            <div className={styles.fields}>
              {profile.fields.map((f) =>
                f.type === 'select' ? (
                  <label key={f.key} className={styles.field}>
                    <span className={styles.fieldLabel}>{f.label}</span>
                    <div className={styles.selectWrap}>
                      <select
                        className={`${styles.select} tnum`}
                        value={values[f.key] ?? ''}
                        onChange={(e) => setField(f.key, e.target.value)}
                        aria-label={f.label}
                      >
                        <option value="" disabled>
                          انتخاب کنید
                        </option>
                        {f.options?.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <ChevronDownIcon size={18} className={styles.selectChevron} />
                    </div>
                  </label>
                ) : (
                  <label key={f.key} className={styles.field}>
                    <span className={styles.fieldLabel}>
                      {f.label}
                      <span className={styles.fieldUnit}>({f.unit})</span>
                    </span>
                    <input
                      className={`${styles.input} tnum`}
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder={f.placeholder}
                      value={values[f.key] ?? ''}
                      onChange={(e) => setField(f.key, e.target.value)}
                      aria-label={`${f.label} بر حسب ${f.unit}`}
                    />
                  </label>
                ),
              )}
              <label className={styles.field}>
                <span className={styles.fieldLabel}>
                  تعداد {profile.pieceWord}
                  <span className={styles.fieldUnit}>(عدد)</span>
                </span>
                <input
                  className={`${styles.input} tnum`}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="مثلاً ۱۰"
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                  aria-label={`تعداد ${profile.pieceWord}`}
                />
              </label>
            </div>
          </Stack>
        </Card>

        {/* Result — announced politely (accessibility.md §4.3) so the computed
            weight is heard without re-reading the whole panel on every keystroke. */}
        <Card className={styles.result} role="status" aria-live="polite" aria-atomic="true">
          <Stack gap={5}>
            <div>
              <Text variant="overline" color="muted" as="p">
                وزن هر {profile.pieceWord}
              </Text>
              <p className={`${styles.value} tnum`}>
                {perPiece !== null ? (
                  <>
                    <span className={styles.valueNum}>{faNum(perPiece)}</span>
                    <span className={styles.valueUnit}>کیلوگرم</span>
                  </>
                ) : (
                  <span className={styles.empty}>
                    {invalidGeometry ? 'ابعاد واردشده برای این مقطع معتبر نیست.' : 'مقادیر را وارد کنید'}
                  </span>
                )}
              </p>
            </div>

            <div className={styles.divider} aria-hidden="true" />

            <div>
              <Text variant="overline" color="muted" as="p">
                وزن کل ({toPersianDigits(pieces)} {profile.pieceWord})
              </Text>
              <p className={`${styles.valueTotal} tnum`}>
                {total !== null ? (
                  <>
                    <span className={styles.valueNum}>{faNum(total)}</span>
                    <span className={styles.valueUnit}>کیلوگرم</span>
                  </>
                ) : (
                  <span className={styles.empty}>بدون مقدار</span>
                )}
              </p>
              {total !== null && total >= 1000 ? (
                <Text variant="caption" color="muted">
                  معادل {faNum(total / 1000)} تن
                </Text>
              ) : null}
            </div>

            {perPiece !== null ? (
              <p className={styles.formula}>
                <span className={styles.formulaLabel}>فرمول:</span>{' '}
                {profile.perMeter
                  ? `وزن هر متر = ${profile.formula(parsed)} → وزن هر ${profile.pieceWord} = وزن هر متر × طول`
                  : `وزن هر ${profile.pieceWord} = ${profile.formula(parsed)}`}
              </p>
            ) : null}

            <Button
              variant="primary"
              size="md"
              fullWidth
              disabled={total === null}
              onClick={addToCart}
            >
              <PlusIcon size={18} /> افزودن به سبد استعلام
            </Button>
          </Stack>
        </Card>
      </div>

      {/* Reference table — published standard sizes at a glance, same idea as
          مرکزآهن's own جدول‌وزن pages (Amir, 2026-08-09), so a customer can
          sanity-check a result without filling in the form for every size. */}
      {profile.referenceTable ? (
        <Card className={styles.tableCard}>
          <Stack gap={3}>
            <Text variant="overline" color="muted" as="p">
              جدول وزن استاندارد {profile.label}
            </Text>
            <div className={styles.tableScroll}>
              <table className={`${styles.refTable} tnum`}>
                <thead>
                  <tr>
                    {profile.referenceTable.headers.map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {profile.referenceTable.rows.map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) => (
                        <td key={j}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Stack>
        </Card>
      ) : null}

      <Alert tone="info">
        <Cluster gap={2} align="center">
          <CheckCircleIcon size={16} />
          <span>
            وزن‌های نمایش‌داده‌شده تئوریک و بر پایهٔ چگالی استاندارد فولاد است؛ وزن
            واقعی هر محموله ممکن است اندکی متفاوت باشد.
          </span>
        </Cluster>
      </Alert>
    </Stack>
  );
}

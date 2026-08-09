'use client';
import { useMemo, useState } from 'react';
import { useCartStore } from '@/lib/stores/cart';
import { useToast } from '@/lib/hooks/useToast';
import { routes } from '@/lib/routes';
import { toPersianDigits, normalizeDigits } from '@/lib/utils/format';
import { unitWeightKg, IBEAM_KG_PER_M, CHANNEL_KG_PER_M } from '@/lib/utils/weight';
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
 * which fields to ask for, and the Persian formula string shown underneath.
 *
 * audit-2026-08-09: this used to have one combined «نبشی/تسمه» tab whose hint
 * claimed to cover BOTH a flat bar and an equal-leg angle, but only ever ran
 * the flat-bar formula — an angle iron (two legs) weighs roughly double a
 * flat bar of the same "width"/leg and thickness, so a customer using this
 * for a real نبشی quote got a number ~47% under what they'd actually be
 * charged. Split into two honest tabs, «تسمه» and «نبشی», each calling its
 * own already-correct formula in `weight.ts`. Also added «تیرآهن»/«ناودانی»
 * (mill-table lookups, already supported by `weight.ts`/the AI advisor but
 * never exposed here) so a customer can self-serve for every catalog family
 * this site actually sells, not just four of seven.
 */

type Profile = 'rebar' | 'plate' | 'pipe' | 'flat' | 'angle' | 'ibeam' | 'channel';

type Field = {
  key: string;
  label: string;
  unit: string;
  placeholder: string;
  /** 'select' for mill-table sizes (ibeam/channel) — a free-text mm/m value
   *  has no meaning there, only the published size codes do. */
  type?: 'text' | 'select';
  options?: { value: string; label: string }[];
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
};

const sizeOptions = (table: Readonly<Record<string, number>>) =>
  Object.keys(table)
    .map(Number)
    .sort((a, b) => a - b)
    .map((n) => ({ value: String(n), label: toPersianDigits(n) }));

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
  },
  {
    key: 'angle',
    label: 'نبشی',
    hint: 'وزن هر متر نبشی با بال‌های مساوی بر اساس طول بال و ضخامت.',
    perMeter: true,
    pieceWord: 'شاخه',
    fields: [
      { key: 'leg', label: 'طول بال', unit: 'میلی‌متر', placeholder: 'مثلاً ۴۰' },
      { key: 't', label: 'ضخامت', unit: 'میلی‌متر', placeholder: 'مثلاً ۴' },
      { key: 'len', label: 'طول هر شاخه', unit: 'متر', placeholder: 'مثلاً ۶' },
    ],
    perPiece: (v) => unitWeightKg('angle', { legMm: v.leg, thicknessMm: v.t, lengthM: v.len }),
    formula: (v) =>
      `ضخامت × (۲ × بال − ضخامت) × ۰٫۰۰۷۸۵ = ${toPersianDigits(v.t || 0)} × (۲ × ${toPersianDigits(v.leg || 0)} − ${toPersianDigits(v.t || 0)}) × ۰٫۰۰۷۸۵`,
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
                    {invalidGeometry ? 'ابعاد واردشده برای این مقطع معتبر نیست.' : '— مقادیر را وارد کنید'}
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
                  <span className={styles.empty}>—</span>
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

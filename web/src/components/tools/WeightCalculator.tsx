'use client';
import { useMemo, useState } from 'react';
import { useCartStore } from '@/lib/stores/cart';
import { useToast } from '@/lib/hooks/useToast';
import { routes } from '@/lib/routes';
import { toPersianDigits, normalizeDigits } from '@/lib/utils/format';
import { Card, Stack, Cluster, Text, Alert } from '@/components/ui';
import { Button } from '@/components/ui';
import { PlusIcon, CheckCircleIcon } from '@/components/primitives/icons';
import styles from './WeightCalculator.module.css';

/**
 * وزن‌سنج — theoretical (markazeahan-style) weight for the main steel sections.
 * Steel density 7.85 g/cm³. All math is deterministic; inputs accept Persian
 * digits and are normalized before parsing. The exact formula used is always
 * shown so the result is auditable.
 */

type Profile = 'rebar' | 'plate' | 'pipe' | 'flat';

type Field = {
  key: string;
  label: string;
  unit: string;
  placeholder: string;
};

type ProfileSpec = {
  key: Profile;
  label: string;
  /** Persian description of the section. */
  hint: string;
  fields: Field[];
  /** kg per شاخه/برگ (a single piece) given parsed inputs, or null if incomplete. */
  perPiece: (v: Record<string, number>) => number | null;
  /** Human-readable formula, with the live values substituted in. */
  formula: (v: Record<string, number>) => string;
  /** Whether the piece result is "per meter" (rebar/pipe/flat) or absolute (plate). */
  perMeter: boolean;
  pieceWord: string; // شاخه | برگ
};

const STEEL_DENSITY = 7.85; // g/cm³

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
    perPiece: (v) => {
      const d = v.d;
      const len = v.len;
      if (!d || !len) return null;
      return ((d * d) / 162) * len;
    },
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
    perPiece: (v) => {
      const len = v.len;
      const w = v.w;
      const t = v.t;
      if (!len || !w || !t) return null;
      return len * w * t * STEEL_DENSITY;
    },
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
    perPiece: (v) => {
      const od = v.od;
      const t = v.t;
      const len = v.len;
      if (!od || !t || !len) return null;
      if (t >= od) return null;
      return (od - t) * t * 0.02466 * len;
    },
    formula: (v) =>
      `(قطر خارجی − ضخامت) × ضخامت × ۰٫۰۲۴۶۶ = (${toPersianDigits(v.od || 0)} − ${toPersianDigits(v.t || 0)}) × ${toPersianDigits(v.t || 0)} × ۰٫۰۲۴۶۶`,
  },
  {
    key: 'flat',
    label: 'نبشی/تسمه',
    hint: 'وزن هر متر تسمه یا نبشی بر اساس عرض و ضخامت مقطع.',
    perMeter: true,
    pieceWord: 'شاخه',
    fields: [
      { key: 'w', label: 'عرض', unit: 'میلی‌متر', placeholder: 'مثلاً ۴۰' },
      { key: 't', label: 'ضخامت', unit: 'میلی‌متر', placeholder: 'مثلاً ۴' },
      { key: 'len', label: 'طول هر شاخه', unit: 'متر', placeholder: 'مثلاً ۶' },
    ],
    perPiece: (v) => {
      const w = v.w;
      const t = v.t;
      const len = v.len;
      if (!w || !t || !len) return null;
      return w * t * 0.00785 * len;
    },
    formula: (v) =>
      `عرض × ضخامت × ۰٫۰۰۷۸۵ = ${toPersianDigits(v.w || 0)} × ${toPersianDigits(v.t || 0)} × ۰٫۰۰۷۸۵`,
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
              {profile.fields.map((f) => (
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
              ))}
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
                  <span className={styles.empty}>— مقادیر را وارد کنید</span>
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

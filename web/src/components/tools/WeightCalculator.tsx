'use client';
import { useMemo, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useCartStore } from '@/lib/stores/cart';
import { useToast } from '@/lib/hooks/useToast';
import { routes } from '@/lib/routes';
import { toPersianDigits, normalizeDigits, localizeDigits } from '@/lib/utils/format';
import { unitWeightKg, IBEAM_KG_PER_M, CHANNEL_KG_PER_M, ANGLE_KG_PER_M } from '@/lib/utils/weight';
import { Card, Stack, Cluster, Text, Alert } from '@/components/ui';
import { Button } from '@/components/ui';
import { PlusIcon, CheckCircleIcon, ChevronDownIcon } from '@/components/primitives/icons';
import type { AppLocale } from '@/i18n/config';
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
 * which fields to ask for, the formula string shown underneath, and
 * (audit-2026-08-09) a static reference table per profile — see
 * `buildReferenceTables` below. All display strings are localized (i18n
 * audit follow-up); only the underlying numeric constants and lookup tables
 * are language-independent.
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
  ariaLabel: string;
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
  pieceWord: string; // localized شاخه | برگ
  /** Static published-size reference table shown under the calculator,
   *  matching مرکزآهن's own جدول‌وزن pages — Amir's explicit request
   *  (2026-08-09) after a page-by-page formula comparison against them. */
  referenceTable?: ReferenceTable;
};

/** Standard thickness that ships with each published نبشی leg size — display
 *  only (the live calc reads the weight straight from `ANGLE_KG_PER_M`). */
const ANGLE_STANDARD_THICKNESS_MM: Readonly<Record<string, number>> = {
  '30': 3, '40': 4, '50': 5, '60': 6, '70': 7, '80': 8, '100': 10, '120': 12,
};

const PLATE_STANDARD_WIDTH_M = 1.5;
const PLATE_STANDARD_LENGTH_M = 6;
const PIPE_STANDARD_THICKNESS_MM = 2;
const FLAT_SIZES: [number, number][] = [
  [20, 3], [25, 3], [30, 3], [40, 4], [40, 5], [50, 5], [50, 6], [60, 6], [80, 8], [100, 10],
];

const round2 = (n: number) => Math.round(n * 100) / 100;

function parse(value: string): number {
  const n = Number(normalizeDigits(value).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Show up to 2 decimals, locale digits, trimmed trailing zeros. */
function localizedNum(n: number, locale: AppLocale): string {
  const rounded = Math.round(n * 100) / 100;
  const str = rounded.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return locale === 'fa' ? toPersianDigits(str).replace(/,/g, '٬') : str;
}

/** A fixed formula constant (162, 7.85, 0.02466, 0.00785): Persian digits with
 *  the Persian decimal separator for fa, plain ASCII for every other locale —
 *  matching how the rest of this file's live values are localized. */
function localizedConst(value: string, locale: AppLocale): string {
  return locale === 'fa' ? toPersianDigits(value).replace('.', '٫') : value;
}

const sizeOptions = (table: Readonly<Record<string, number>>, locale: AppLocale) =>
  Object.keys(table)
    .map(Number)
    .sort((a, b) => a - b)
    .map((n) => ({ value: String(n), label: localizeDigits(n, locale) }));

type T = ReturnType<typeof useTranslations>;

/** Common shape for every bar/profile table: size label, weight/metre, weight
 *  for one standard branch. Plate (sold by the sheet, not the metre) builds
 *  its own table below instead of using this helper. */
function perMeterTable(
  t: T,
  locale: AppLocale,
  sizeHeader: string,
  branchM: number,
  sizes: number[],
  perMFor: (size: number) => number,
  labelFor: (size: number) => string = (s) => localizeDigits(s, locale),
): ReferenceTable {
  return {
    headers: [
      sizeHeader,
      t('tableHeaders.weightPerMeterKg'),
      t('tableHeaders.weightPerBranchLengthKg', { length: localizeDigits(branchM, locale) }),
    ],
    rows: sizes.map((s) => {
      const perM = round2(perMFor(s));
      return [labelFor(s), localizedNum(perM, locale), localizedNum(round2(perM * branchM), locale)];
    }),
  };
}

function buildReferenceTables(t: T, locale: AppLocale): Record<Profile, ReferenceTable> {
  const rebar = perMeterTable(
    t,
    locale,
    t('tableHeaders.diameterMm'),
    12,
    [8, 10, 12, 14, 16, 18, 20, 22, 25, 28, 32],
    (d) => (d * d) / 162,
  );

  const plate: ReferenceTable = {
    headers: [
      t('tableHeaders.thicknessMm'),
      t('tableHeaders.widthM'),
      t('tableHeaders.lengthM'),
      t('tableHeaders.weightPerSheetKg'),
    ],
    rows: [3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30].map((th) => {
      const w = round2(th * PLATE_STANDARD_WIDTH_M * PLATE_STANDARD_LENGTH_M * 7.85);
      return [
        localizeDigits(th, locale),
        localizeDigits(PLATE_STANDARD_WIDTH_M, locale),
        localizeDigits(PLATE_STANDARD_LENGTH_M, locale),
        localizedNum(w, locale),
      ];
    }),
  };

  const pipe = perMeterTable(
    t,
    locale,
    t('tableHeaders.outerDiameterWithThickness', {
      thickness: localizeDigits(PIPE_STANDARD_THICKNESS_MM, locale),
    }),
    6,
    [21.3, 26.7, 33.4, 42.2, 48.3, 60.3, 73, 88.9, 114.3],
    (od) => (od - PIPE_STANDARD_THICKNESS_MM) * PIPE_STANDARD_THICKNESS_MM * 0.02466,
  );

  const flat: ReferenceTable = {
    headers: [
      t('tableHeaders.widthXThicknessMm'),
      t('tableHeaders.weightPerMeterKg'),
      t('tableHeaders.weightPerBranchLengthKg', { length: localizeDigits(6, locale) }),
    ],
    rows: FLAT_SIZES.map(([w, th]) => {
      const perM = round2(w * th * 0.00785);
      return [
        `${localizeDigits(w, locale)}×${localizeDigits(th, locale)}`,
        localizedNum(perM, locale),
        localizedNum(round2(perM * 6), locale),
      ];
    }),
  };

  const angle = perMeterTable(
    t,
    locale,
    t('tableHeaders.angleSize'),
    6,
    Object.keys(ANGLE_KG_PER_M).map(Number).sort((a, b) => a - b),
    (leg) => ANGLE_KG_PER_M[String(leg)]!,
    (leg) => {
      const th = ANGLE_STANDARD_THICKNESS_MM[String(leg)] ?? 0;
      return `L${localizeDigits(leg, locale)}×${localizeDigits(leg, locale)}×${localizeDigits(th, locale)}`;
    },
  );

  const ibeam = perMeterTable(
    t,
    locale,
    t('terms.size'),
    12,
    Object.keys(IBEAM_KG_PER_M).map(Number).sort((a, b) => a - b),
    (size) => IBEAM_KG_PER_M[String(size)]!,
  );

  const channel = perMeterTable(
    t,
    locale,
    t('terms.size'),
    6,
    Object.keys(CHANNEL_KG_PER_M).map(Number).sort((a, b) => a - b),
    (size) => CHANNEL_KG_PER_M[String(size)]!,
  );

  return { rebar, plate, pipe, flat, angle, ibeam, channel };
}

function buildProfiles(t: T, locale: AppLocale, refTables: Record<Profile, ReferenceTable>): ProfileSpec[] {
  const branch = t('pieceWords.branch');
  const sheet = t('pieceWords.sheet');
  const diameter = t('terms.diameter');
  const outerDiameter = t('terms.outerDiameter');
  const wallThickness = t('terms.wallThickness');
  const thickness = t('terms.thickness');
  const width = t('terms.width');
  const length = t('terms.length');
  const lengthPerBranch = t('terms.lengthPerPiece', { piece: branch });
  const size = t('terms.size');
  const sizeLegLength = t('terms.sizeLegLength');
  const mm = t('units.mm');
  const m = t('units.m');
  const example = (value: number | string) => t('example', { value: localizeDigits(value, locale) });
  const fieldAria = (label: string, unit: string) => t('fieldAriaLabel', { label, unit });
  const rebarLabel = t('profiles.rebar.label');
  const plateLabel = t('profiles.plate.label');
  const pipeLabel = t('profiles.pipe.label');
  const flatLabel = t('profiles.flat.label');
  const angleLabel = t('profiles.angle.label');
  const ibeamLabel = t('profiles.ibeam.label');
  const channelLabel = t('profiles.channel.label');

  return [
    {
      key: 'rebar',
      label: rebarLabel,
      hint: t('profiles.rebar.hint'),
      perMeter: true,
      pieceWord: branch,
      fields: [
        { key: 'd', label: diameter, unit: mm, placeholder: example(14), ariaLabel: fieldAria(diameter, mm) },
        {
          key: 'len',
          label: lengthPerBranch,
          unit: m,
          placeholder: example(12),
          ariaLabel: fieldAria(lengthPerBranch, m),
        },
      ],
      perPiece: (v) => unitWeightKg('rebar', { diameterMm: v.d, lengthM: v.len }),
      formula: (v) => {
        const divisor = localizedConst('162', locale);
        const val = localizeDigits(v.d || 0, locale);
        return `(${diameter}² ÷ ${divisor}) = (${val}² ÷ ${divisor})`;
      },
      referenceTable: refTables.rebar,
    },
    {
      key: 'plate',
      label: plateLabel,
      hint: t('profiles.plate.hint'),
      perMeter: false,
      pieceWord: sheet,
      fields: [
        { key: 'len', label: length, unit: m, placeholder: example(6), ariaLabel: fieldAria(length, m) },
        { key: 'w', label: width, unit: m, placeholder: example('1.25'), ariaLabel: fieldAria(width, m) },
        { key: 't', label: thickness, unit: mm, placeholder: example(3), ariaLabel: fieldAria(thickness, mm) },
      ],
      perPiece: (v) => unitWeightKg('plate', { lengthM: v.len, widthM: v.w, thicknessMm: v.t }),
      formula: (v) => {
        const c = localizedConst('7.85', locale);
        return `${length} × ${width} × ${thickness} × ${c} = ${localizeDigits(v.len || 0, locale)} × ${localizeDigits(v.w || 0, locale)} × ${localizeDigits(v.t || 0, locale)} × ${c}`;
      },
      referenceTable: refTables.plate,
    },
    {
      key: 'pipe',
      label: pipeLabel,
      hint: t('profiles.pipe.hint'),
      perMeter: true,
      pieceWord: branch,
      fields: [
        {
          key: 'od',
          label: outerDiameter,
          unit: mm,
          placeholder: example(60),
          ariaLabel: fieldAria(outerDiameter, mm),
        },
        {
          key: 't',
          label: wallThickness,
          unit: mm,
          placeholder: example(3),
          ariaLabel: fieldAria(wallThickness, mm),
        },
        {
          key: 'len',
          label: lengthPerBranch,
          unit: m,
          placeholder: example(6),
          ariaLabel: fieldAria(lengthPerBranch, m),
        },
      ],
      perPiece: (v) =>
        unitWeightKg('pipe', { outerDiameterMm: v.od, thicknessMm: v.t, lengthM: v.len }),
      formula: (v) => {
        const c = localizedConst('0.02466', locale);
        const od = localizeDigits(v.od || 0, locale);
        const th = localizeDigits(v.t || 0, locale);
        return `(${outerDiameter} − ${wallThickness}) × ${wallThickness} × ${c} = (${od} − ${th}) × ${th} × ${c}`;
      },
      referenceTable: refTables.pipe,
    },
    {
      key: 'flat',
      label: flatLabel,
      hint: t('profiles.flat.hint'),
      perMeter: true,
      pieceWord: branch,
      fields: [
        { key: 'w', label: width, unit: mm, placeholder: example(40), ariaLabel: fieldAria(width, mm) },
        { key: 't', label: thickness, unit: mm, placeholder: example(4), ariaLabel: fieldAria(thickness, mm) },
        {
          key: 'len',
          label: lengthPerBranch,
          unit: m,
          placeholder: example(6),
          ariaLabel: fieldAria(lengthPerBranch, m),
        },
      ],
      perPiece: (v) => unitWeightKg('flat', { widthMm: v.w, thicknessMm: v.t, lengthM: v.len }),
      formula: (v) => {
        const c = localizedConst('0.00785', locale);
        return `${width} × ${thickness} × ${c} = ${localizeDigits(v.w || 0, locale)} × ${localizeDigits(v.t || 0, locale)} × ${c}`;
      },
      referenceTable: refTables.flat,
    },
    {
      key: 'angle',
      label: angleLabel,
      hint: t('profiles.angle.hint'),
      perMeter: true,
      pieceWord: branch,
      fields: [
        {
          key: 'size',
          label: sizeLegLength,
          unit: '',
          placeholder: '',
          ariaLabel: sizeLegLength,
          type: 'select',
          options: sizeOptions(ANGLE_KG_PER_M, locale),
        },
        {
          key: 'len',
          label: lengthPerBranch,
          unit: m,
          placeholder: example(6),
          ariaLabel: fieldAria(lengthPerBranch, m),
        },
      ],
      perPiece: (v) => unitWeightKg('angle', { sizeCode: v.size, lengthM: v.len }),
      formula: (v) => {
        const kgPerM = ANGLE_KG_PER_M[String(Math.round(v.size || 0))];
        const th = ANGLE_STANDARD_THICKNESS_MM[String(Math.round(v.size || 0))] ?? 0;
        const sz = localizeDigits(v.size || 0, locale);
        const subject = `${angleLabel} L${sz}×${sz}×${localizeDigits(th, locale)}`;
        return t('perStandardTable', { subject, value: localizeDigits(kgPerM ?? 0, locale) });
      },
      referenceTable: refTables.angle,
    },
    {
      key: 'ibeam',
      label: ibeamLabel,
      hint: t('profiles.ibeam.hint'),
      perMeter: true,
      pieceWord: branch,
      fields: [
        {
          key: 'size',
          label: size,
          unit: '',
          placeholder: '',
          ariaLabel: size,
          type: 'select',
          options: sizeOptions(IBEAM_KG_PER_M, locale),
        },
        {
          key: 'len',
          label: lengthPerBranch,
          unit: m,
          placeholder: example(12),
          ariaLabel: fieldAria(lengthPerBranch, m),
        },
      ],
      perPiece: (v) => unitWeightKg('ibeam', { sizeCode: v.size, lengthM: v.len }),
      formula: (v) => {
        const kgPerM = IBEAM_KG_PER_M[String(Math.round(v.size || 0))];
        const subject = `${ibeamLabel} ${localizeDigits(v.size || 0, locale)}`;
        return t('perMillTable', { subject, value: localizeDigits(kgPerM ?? 0, locale) });
      },
      referenceTable: refTables.ibeam,
    },
    {
      key: 'channel',
      label: channelLabel,
      hint: t('profiles.channel.hint'),
      perMeter: true,
      pieceWord: branch,
      fields: [
        {
          key: 'size',
          label: size,
          unit: '',
          placeholder: '',
          ariaLabel: size,
          type: 'select',
          options: sizeOptions(CHANNEL_KG_PER_M, locale),
        },
        {
          key: 'len',
          label: lengthPerBranch,
          unit: m,
          placeholder: example(6),
          ariaLabel: fieldAria(lengthPerBranch, m),
        },
      ],
      perPiece: (v) => unitWeightKg('channel', { sizeCode: v.size, lengthM: v.len }),
      formula: (v) => {
        const kgPerM = CHANNEL_KG_PER_M[String(Math.round(v.size || 0))];
        const subject = `${channelLabel} ${localizeDigits(v.size || 0, locale)}`;
        return t('perMillTable', { subject, value: localizeDigits(kgPerM ?? 0, locale) });
      },
      referenceTable: refTables.channel,
    },
  ];
}

export function WeightCalculator() {
  const t = useTranslations('weightCalculator');
  const locale = useLocale() as AppLocale;
  const add = useCartStore((s) => s.add);
  const toast = useToast();

  const [profileKey, setProfileKey] = useState<Profile>('rebar');
  const [values, setValues] = useState<Record<string, string>>({});
  const [count, setCount] = useState('1');

  const refTables = useMemo(() => buildReferenceTables(t, locale), [t, locale]);
  const PROFILES = useMemo(() => buildProfiles(t, locale, refTables), [t, locale, refTables]);

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
      name: t('cartItemName', { profile: profile.label }),
      qty: pieces,
      unit: profile.key === 'plate' ? 'sheet' : 'branch',
      weightKg: Math.round(perPiece * 100) / 100,
    });
    toast.success(t('addedToCartToast'), {
      label: t('viewCart'),
      href: routes.cart(),
    });
  };

  return (
    <Stack gap={6}>
      {/* Profile selector — segmented */}
      <div
        className={styles.segmented}
        role="group"
        aria-label={t('sectionType')}
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
                        aria-label={f.ariaLabel}
                      >
                        <option value="" disabled>
                          {t('selectPlaceholder')}
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
                      aria-label={f.ariaLabel}
                    />
                  </label>
                ),
              )}
              <label className={styles.field}>
                <span className={styles.fieldLabel}>
                  {t('pieceCountLabel', { piece: profile.pieceWord })}
                  <span className={styles.fieldUnit}>({t('units.count')})</span>
                </span>
                <input
                  className={`${styles.input} tnum`}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder={t('example', { value: localizeDigits(10, locale) })}
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                  aria-label={t('pieceCountLabel', { piece: profile.pieceWord })}
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
                {t('weightPerPiece', { piece: profile.pieceWord })}
              </Text>
              <p className={`${styles.value} tnum`}>
                {perPiece !== null ? (
                  <>
                    <span className={styles.valueNum}>{localizedNum(perPiece, locale)}</span>
                    <span className={styles.valueUnit}>{t('kg')}</span>
                  </>
                ) : (
                  <span className={styles.empty}>
                    {invalidGeometry ? t('invalidGeometry') : t('enterValues')}
                  </span>
                )}
              </p>
            </div>

            <div className={styles.divider} aria-hidden="true" />

            <div>
              <Text variant="overline" color="muted" as="p">
                {t('totalWeight', { count: localizeDigits(pieces, locale), piece: profile.pieceWord })}
              </Text>
              <p className={`${styles.valueTotal} tnum`}>
                {total !== null ? (
                  <>
                    <span className={styles.valueNum}>{localizedNum(total, locale)}</span>
                    <span className={styles.valueUnit}>{t('kg')}</span>
                  </>
                ) : (
                  <span className={styles.empty}>{t('noValue')}</span>
                )}
              </p>
              {total !== null && total >= 1000 ? (
                <Text variant="caption" color="muted">
                  {t('equivalentTons', { value: localizedNum(total / 1000, locale) })}
                </Text>
              ) : null}
            </div>

            {perPiece !== null ? (
              <p className={styles.formula}>
                <span className={styles.formulaLabel}>{t('formulaLabel')}</span>{' '}
                {profile.perMeter
                  ? t('formulaPerMeter', { formula: profile.formula(parsed), piece: profile.pieceWord })
                  : t('formulaAbsolute', { formula: profile.formula(parsed), piece: profile.pieceWord })}
              </p>
            ) : null}

            <Button
              variant="primary"
              size="md"
              fullWidth
              disabled={total === null}
              onClick={addToCart}
            >
              <PlusIcon size={18} /> {t('addToCart')}
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
              {t('referenceTableTitle', { profile: profile.label })}
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
          <span>{t('disclaimer')}</span>
        </Cluster>
      </Alert>
    </Stack>
  );
}

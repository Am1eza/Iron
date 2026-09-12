'use client';
import { useEffect, useMemo, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { routes } from '@/lib/routes';
import { toPersianDigits, normalizeDigits, formatToman, localizeDigits } from '@/lib/utils/format';
import { Card, Stack, Cluster, Text, Alert } from '@/components/ui';
import { AiMarkIcon, ArrowEndIcon, ChevronDownIcon } from '@/components/primitives/icons';
import type { PriceRow } from '@/lib/types/domain';
import type { AppLocale } from '@/i18n/config';
import styles from './ProjectEstimator.module.css';

/**
 * برآورد آهن‌آلات پروژه — BOQ-level material take-off, one profile per real
 * project shape, each line item priced against a user-chosen real SKU.
 *
 * audit-2026-08-09 round 2 (Amir): round 1 of this redesign (concrete/steel/
 * shed profiles, catalog-average pricing) still modeled each project as a
 * single "میلگرد + بتن" or "میلگرد + تیرآهن" pair — Amir's pushback: "مگه
 * فقط در یک سازه میلگرد استفاده میشه و بتن؟" A real structure's frame and
 * its roof/slab are built from DIFFERENT material families depending on the
 * LATERAL SYSTEM (بادبند/قاب خمشی/دوگانه) and the ROOF SYSTEM (تیرچه‌بلوک/
 * دال توپر/کامپوزیت) chosen — Iran's dominant residential slab system,
 * تیرچه‌بلوک, was invisible before. Also: he wants to price each line item
 * against a SPECIFIC catalog SKU (grade+size+factory), not a blind
 * category-wide average — a real میلگرد purchase is never "the average of
 * all 30 rebar SKUs," it's a specific size/grade/factory.
 *
 * Coefficients below are cross-checked against multiple independent Iranian
 * civil-engineering references (رادمان‌آهن، سبزسازه، فولاد ایرانیان، مستر
 * آهن، کارکشته، آکادمی عمران، سازه‌نگار سینا — 2026-08-09). Every one is
 * shown as the RANGE its source gives — the calculation uses the range's
 * midpoint. رادمان‌آهن's breakdown (frame weight BY lateral-system type,
 * roof/slab weight BY roof type, foundation kept separate) is the single
 * clearest source and is what this file's structure now follows directly.
 *
 * Deliberately NOT modeled (disclosed in the UI, not silently omitted):
 * - فونداسیون (foundation): depends on soil bearing capacity, not area.
 * - سوله's پرلین (purlins) and روف/دیوار پوشش (roof/wall sheeting): both
 *   depend on purlin spacing and roof design, not just span×length — no
 *   sourced per-m² figure exists without those extra inputs, and inventing
 *   one would be fake precision, not real BOQ engineering.
 *
 * Prices are fetched live per line item via `api.catalog.category()` (same
 * client `PriceTable`/`CostCalculator`/`WeightCalculator` already use) —
 * this used to read `@/lib/mock/catalogData`'s seeded-PRNG fixtures
 * unconditionally, the same bug already fixed for `/tools/cost` in #99.
 *
 * All display strings are localized (i18n audit follow-up) — the
 * engineering-source Persian labels in the comments above are for the
 * benefit of future maintainers cross-checking against those references;
 * the coefficient tables themselves are language-independent.
 */

type ProjectType = 'concrete' | 'steel' | 'shed';
type SystemKey = string;
type SystemOption = { key: SystemKey; range: [number, number]; mid: number };
type CategoryKey = 'ibeam' | 'profile' | 'angleChannel';

const CONCRETE_LATERAL_SYSTEMS: SystemOption[] = [
  { key: 'shearwall', range: [35, 60], mid: 48 },
  { key: 'moment-medium', range: [40, 55], mid: 48 },
  { key: 'moment-special', range: [45, 70], mid: 58 },
];

const STEEL_LATERAL_SYSTEMS: SystemOption[] = [
  { key: 'cbf', range: [45, 70], mid: 58 },
  { key: 'ebf', range: [50, 75], mid: 63 },
  { key: 'moment-medium', range: [65, 105], mid: 85 },
  { key: 'moment-special', range: [70, 115], mid: 93 },
  { key: 'dual', range: [70, 120], mid: 95 },
];

const ROOF_SYSTEMS: SystemOption[] = [
  { key: 'joist-block', range: [5, 7], mid: 6 },
  { key: 'solid-slab', range: [10, 16], mid: 13 },
  { key: 'composite', range: [8, 12], mid: 10 },
];

const STEEL_FRAME_CATEGORY_KEYS: CategoryKey[] = ['ibeam', 'profile', 'angleChannel'];
const SHED_FRAME_CATEGORY_KEYS: CategoryKey[] = ['ibeam', 'profile'];

const CONCRETE_M3_RANGE: [number, number] = [0.35, 0.5];
const CONCRETE_M3_PER_M2 = 0.4;

const SHED_SPANS: { span: number; columns: 0 | 1 | 2; kgPerM2: number }[] = [
  { span: 10, columns: 0, kgPerM2: 25 },
  { span: 15, columns: 0, kgPerM2: 28 },
  { span: 20, columns: 0, kgPerM2: 30 },
  { span: 25, columns: 0, kgPerM2: 37 },
  { span: 30, columns: 0, kgPerM2: 43 },
  { span: 40, columns: 1, kgPerM2: 50 },
  { span: 50, columns: 1, kgPerM2: 40 },
  { span: 60, columns: 1, kgPerM2: 40 },
  { span: 60, columns: 2, kgPerM2: 35 },
];
const shedOptionKey = (s: (typeof SHED_SPANS)[number]) => `${s.span}-${s.columns}`;

type T = ReturnType<typeof useTranslations>;

function shedSpanLabel(s: (typeof SHED_SPANS)[number], t: T, locale: AppLocale): string {
  const span = localizeDigits(s.span, locale);
  return s.columns > 0
    ? t('shedSpanWithColumns', { span, columns: localizeDigits(s.columns, locale) })
    : t('shedSpanWithoutColumns', { span });
}

function parse(value: string): number {
  const n = Number(normalizeDigits(value).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function faNum(n: number, locale: AppLocale, maxFrac = 1): string {
  const str = n.toLocaleString('en-US', { maximumFractionDigits: maxFrac });
  return locale === 'fa' ? toPersianDigits(str).replace(/,/g, '٬') : str;
}

/** For fixed decimal constants (e.g. 0.4 m³/m²) embedded in static disclaimer
 *  text — fa uses the Persian decimal separator «٫», every other locale
 *  keeps the plain ASCII point. */
function localizedDecimal(n: number, locale: AppLocale): string {
  return locale === 'fa' ? toPersianDigits(String(n)).replace('.', '٫') : String(n);
}

function rangeText([min, max]: [number, number], t: T, locale: AppLocale): string {
  return `${localizeDigits(min, locale)} ${t('rangeTo')} ${localizeDigits(max, locale)}`;
}

function joinedRanges(
  systems: SystemOption[],
  labelFor: (key: SystemKey) => string,
  t: T,
  locale: AppLocale,
): string {
  return systems
    .map((s) => `${labelFor(s.key)} ${rangeText(s.range, t, locale)}`)
    .join(t('listSeparator'));
}

/** «میلگرد آجدار A2 ۱۸ (ذوب‌آهن اصفهان)» — grade/size/factory make a rebar
 *  SKU meaningfully different in price; a bare product name alone (identical
 *  across grades) would leave the select unusable. */
function skuLabel(row: PriceRow, t: T, locale: AppLocale): string {
  const bits = [
    row.grade,
    row.size ? t('sizeBit', { size: localizeDigits(row.size, locale) }) : null,
    row.factory,
  ].filter(Boolean);
  return bits.length > 0 ? `${row.name} (${bits.join(' - ')})` : row.name;
}

function useCategoryRows(slug: string) {
  const { data, isLoading } = useQuery({
    queryKey: ['catalog', 'category-rows', slug],
    queryFn: () => api.catalog.category(slug),
    staleTime: 5 * 60 * 1000,
  });
  const rows = useMemo(
    () => (data?.rows ?? []).filter((r) => !r.current.priceHidden && !r.current.priceIsEstimated && r.current.price > 0),
    [data],
  );
  return { rows, isLoading };
}

/** One BOQ line: a computed weight (kg), an optional product-category choice
 *  (only shown when a line can realistically be priced against more than one
 *  catalog category — e.g. a steel frame's اسکلت could be تیرآهن or پروفیل),
 *  and a specific-SKU choice within that category. Cost = weight × the
 *  SELECTED sku's live price, never a category-wide average. */
function MaterialRow({
  label,
  weightKg,
  categoryOptions,
  category,
  onCategoryChange,
  rows,
  skuId,
  onSkuChange,
  isLoading,
}: {
  label: string;
  weightKg: number;
  categoryOptions?: { key: CategoryKey; label: string }[];
  category?: CategoryKey;
  onCategoryChange?: (key: CategoryKey) => void;
  rows: PriceRow[];
  skuId: string;
  onSkuChange: (id: string) => void;
  isLoading: boolean;
}) {
  const t = useTranslations('projectEstimator');
  const locale = useLocale() as AppLocale;
  const selected = rows.find((r) => r.id === skuId) ?? null;
  const cost = selected ? weightKg * selected.current.price : null;

  return (
    <div className={styles.lineItem}>
      <div className={styles.lineItemHead}>
        <Text variant="label" as="span">
          {label}
        </Text>
        <Text variant="caption" color="muted">
          <span className="tnum">{faNum(weightKg, locale)}</span> {t('unitKg')}
        </Text>
      </div>
      <div className={styles.lineItemFields}>
        {categoryOptions ? (
          <div className={styles.selectWrap}>
            <select
              className={`${styles.select} ${styles.selectSm} tnum`}
              value={category}
              onChange={(e) => onCategoryChange?.(e.target.value as CategoryKey)}
              aria-label={t('categoryAria', { label })}
            >
              {categoryOptions.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
            <ChevronDownIcon size={16} className={styles.selectChevron} />
          </div>
        ) : null}
        <div className={styles.selectWrap}>
          <select
            className={`${styles.select} ${styles.selectSm} tnum`}
            value={skuId}
            onChange={(e) => onSkuChange(e.target.value)}
            aria-label={t('skuAria', { label })}
            disabled={rows.length === 0}
          >
            {rows.length === 0 ? (
              <option value="">{isLoading ? t('loadingOptions') : t('noSkuAvailable')}</option>
            ) : (
              rows.map((r) => (
                <option key={r.id} value={r.id}>
                  {skuLabel(r, t, locale)}
                </option>
              ))
            )}
          </select>
          <ChevronDownIcon size={16} className={styles.selectChevron} />
        </div>
      </div>
      <div className={`${styles.lineItemCost} tnum`}>
        {isLoading ? (
          <Text variant="caption" color="muted">
            {t('fetchingPrice')}
          </Text>
        ) : cost !== null ? (
          formatToman(cost)
        ) : (
          <Text variant="caption" color="muted">
            {t('noPriceAvailable')}
          </Text>
        )}
      </div>
    </div>
  );
}

export function ProjectEstimator() {
  const t = useTranslations('projectEstimator');
  const locale = useLocale() as AppLocale;

  const [projectType, setProjectType] = useState<ProjectType>('concrete');
  const [areaInput, setAreaInput] = useState('');
  const [floorsInput, setFloorsInput] = useState('1');
  const [shedKey, setShedKey] = useState('');
  const [shedLengthInput, setShedLengthInput] = useState('');
  const [lateralKey, setLateralKey] = useState('shearwall');
  const [roofKey, setRoofKey] = useState('joist-block');
  const [frameCategory, setFrameCategory] = useState<CategoryKey>('ibeam');
  const [frameSkuId, setFrameSkuId] = useState('');
  const [roofSkuId, setRoofSkuId] = useState('');

  // Two separate lookups, not one keyed off the current `projectType` state —
  // `concreteBody`/`steelBody` below both render unconditionally every
  // render (so their disclaimer text is ready the instant the user switches
  // tabs), and each must always resolve its OWN system keys against its own
  // namespace regardless of which tab is currently active, or a steel key
  // (e.g. 'cbf') looked up under `concreteLateral` throws MISSING_MESSAGE.
  const concreteLateralLabel = (key: SystemKey) => t(`systems.concreteLateral.${camel(key)}`);
  const steelLateralLabel = (key: SystemKey) => t(`systems.steelLateral.${camel(key)}`);
  const lateralLabel = projectType === 'concrete' ? concreteLateralLabel : steelLateralLabel;
  const roofLabel = (key: SystemKey) => t(`systems.roof.${camel(key)}`);
  const frameCategoryLabel = (key: CategoryKey) => t(`systems.frameCategories.${key}`);

  const rebarRows = useCategoryRows('rebar');
  const ibeamRows = useCategoryRows('ibeam');
  const profileRows = useCategoryRows('profile');
  const angleChannelRows = useCategoryRows('angle-channel');
  const categoryRows: Record<CategoryKey, { rows: PriceRow[]; isLoading: boolean }> = {
    ibeam: ibeamRows,
    profile: profileRows,
    angleChannel: angleChannelRows,
  };

  const area = parse(areaInput);
  const floors = Math.max(1, Math.round(parse(floorsInput)) || 1);
  const shedLength = parse(shedLengthInput);
  const shedSpan = SHED_SPANS.find((s) => shedOptionKey(s) === shedKey);

  const frameRows = projectType === 'concrete' ? rebarRows : categoryRows[frameCategory];
  const roofRows = rebarRows;

  // Rows arrive async (and change when the user switches product category) —
  // pick the first priced SKU the moment they're available, same pattern
  // CostCalculator already uses for its category→product cascade.
  useEffect(() => {
    if (frameRows.rows.length > 0 && !frameRows.rows.some((r) => r.id === frameSkuId)) {
      setFrameSkuId(frameRows.rows[0]!.id);
    }
  }, [frameRows.rows, frameSkuId]);
  useEffect(() => {
    if (roofRows.rows.length > 0 && !roofRows.rows.some((r) => r.id === roofSkuId)) {
      setRoofSkuId(roofRows.rows[0]!.id);
    }
  }, [roofRows.rows, roofSkuId]);

  const result = useMemo(() => {
    if (projectType === 'shed') {
      if (!shedSpan || shedLength <= 0) return null;
      const totalArea = shedSpan.span * shedLength;
      return { kind: 'shed' as const, totalArea, frameKg: totalArea * shedSpan.kgPerM2 };
    }

    const totalArea = area * floors;
    if (totalArea <= 0) return null;

    const systems = projectType === 'concrete' ? CONCRETE_LATERAL_SYSTEMS : STEEL_LATERAL_SYSTEMS;
    const system = systems.find((s) => s.key === lateralKey) ?? systems[0]!;
    const roof = ROOF_SYSTEMS.find((r) => r.key === roofKey) ?? ROOF_SYSTEMS[0]!;
    const frameKg = totalArea * system.mid;
    const roofKg = totalArea * roof.mid;

    if (projectType === 'concrete') {
      return {
        kind: 'concrete' as const,
        totalArea,
        frameKg,
        roofKg,
        concreteM3: totalArea * CONCRETE_M3_PER_M2,
        system,
        roof,
      };
    }
    return { kind: 'steel' as const, totalArea, frameKg, roofKg, system, roof };
  }, [projectType, area, floors, shedSpan, shedLength, lateralKey, roofKey]);

  const frameSku = frameRows.rows.find((r) => r.id === frameSkuId) ?? null;
  const roofSku = roofRows.rows.find((r) => r.id === roofSkuId) ?? null;
  const frameCost = result && frameSku ? result.frameKg * frameSku.current.price : null;
  const roofCost = result && result.kind !== 'shed' && roofSku ? result.roofKg * roofSku.current.price : null;
  const totalCost =
    result?.kind === 'shed'
      ? frameCost
      : frameCost !== null && roofCost !== null
        ? frameCost + roofCost
        : null;
  const totalPricesLoading =
    frameRows.isLoading || (result != null && result.kind !== 'shed' && roofRows.isLoading);

  const switchType = (nt: ProjectType) => {
    setProjectType(nt);
    setFrameSkuId('');
    setRoofSkuId('');
    if (nt === 'concrete') {
      setLateralKey('shearwall');
      setRoofKey('joist-block');
    } else if (nt === 'steel') {
      setLateralKey('cbf');
      setRoofKey('composite');
      setFrameCategory('ibeam');
    } else {
      setFrameCategory('ibeam');
    }
  };

  const onFrameCategoryChange = (key: CategoryKey) => {
    setFrameCategory(key);
    setFrameSkuId('');
  };

  const lateralSystems = projectType === 'concrete' ? CONCRETE_LATERAL_SYSTEMS : STEEL_LATERAL_SYSTEMS;
  const frameCategoryKeys = projectType === 'steel' ? STEEL_FRAME_CATEGORY_KEYS : SHED_FRAME_CATEGORY_KEYS;
  const frameCategoryOptions = frameCategoryKeys.map((key) => ({ key, label: frameCategoryLabel(key) }));

  const kgPerSqm = t('kgPerSqm');
  const concreteBody =
    result?.kind === 'concrete' || projectType === 'concrete'
      ? `${t('disclaimerIntro')} ${[
          t('disclaimerConcreteFrame', {
            ranges: joinedRanges(CONCRETE_LATERAL_SYSTEMS, concreteLateralLabel, t, locale),
            unit: kgPerSqm,
          }),
          t('disclaimerConcreteRoof', {
            ranges: joinedRanges([ROOF_SYSTEMS[0]!, ROOF_SYSTEMS[1]!], roofLabel, t, locale),
            unit: kgPerSqm,
          }),
          t('disclaimerConcreteConcrete', {
            min: localizedDecimal(CONCRETE_M3_RANGE[0], locale),
            max: localizedDecimal(CONCRETE_M3_RANGE[1], locale),
          }),
        ].join(t('listSeparator'))}. ${t('disclaimerFoundationNote')} ${t('disclaimerNotEngineering')}`
      : '';
  const steelBody = `${t('disclaimerIntro')} ${[
    t('disclaimerSteelFrame', {
      ranges: joinedRanges(STEEL_LATERAL_SYSTEMS, steelLateralLabel, t, locale),
      unit: kgPerSqm,
    }),
    t('disclaimerSteelRoof', {
      ranges: joinedRanges([ROOF_SYSTEMS[2]!, ROOF_SYSTEMS[0]!], roofLabel, t, locale),
      unit: kgPerSqm,
    }),
  ].join(t('listSeparator'))}. ${t('disclaimerFoundationNote')} ${t('disclaimerNotEngineering')}`;

  return (
    <Stack gap={6}>
      <div className={styles.segmented} role="group" aria-label={t('projectTypeAria')}>
        <button
          type="button"
          aria-pressed={projectType === 'concrete'}
          className={styles.segment}
          data-active={projectType === 'concrete' ? '' : undefined}
          onClick={() => switchType('concrete')}
        >
          {t('types.concrete')}
        </button>
        <button
          type="button"
          aria-pressed={projectType === 'steel'}
          className={styles.segment}
          data-active={projectType === 'steel' ? '' : undefined}
          onClick={() => switchType('steel')}
        >
          {t('types.steel')}
        </button>
        <button
          type="button"
          aria-pressed={projectType === 'shed'}
          className={styles.segment}
          data-active={projectType === 'shed' ? '' : undefined}
          onClick={() => switchType('shed')}
        >
          {t('types.shed')}
        </button>
      </div>

      <Card>
        <Stack gap={5}>
          <Text variant="body-sm" color="muted">
            {projectType === 'shed' ? t('introShed') : t('introOther')}
          </Text>

          {projectType === 'shed' ? (
            <div className={styles.fields}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>{t('shedSpanLabel')}</span>
                <div className={styles.selectWrap}>
                  <select
                    className={`${styles.select} tnum`}
                    value={shedKey}
                    onChange={(e) => setShedKey(e.target.value)}
                    aria-label={t('shedSpanLabel')}
                  >
                    <option value="" disabled>
                      {t('shedSpanPlaceholder')}
                    </option>
                    {SHED_SPANS.map((s) => (
                      <option key={shedOptionKey(s)} value={shedOptionKey(s)}>
                        {shedSpanLabel(s, t, locale)}
                      </option>
                    ))}
                  </select>
                  <ChevronDownIcon size={18} className={styles.selectChevron} />
                </div>
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>
                  {t('hallLength')}
                  <span className={styles.fieldUnit}>({t('unitMeter')})</span>
                </span>
                <input
                  className={`${styles.input} tnum`}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder={t('example', { value: localizeDigits(40, locale) })}
                  value={shedLengthInput}
                  onChange={(e) => setShedLengthInput(e.target.value)}
                  aria-label={t('hallLengthAria')}
                />
              </label>
            </div>
          ) : (
            <>
              <div className={styles.fields}>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>{t('lateralSystemLabel')}</span>
                  <div className={styles.selectWrap}>
                    <select
                      className={`${styles.select} tnum`}
                      value={lateralKey}
                      onChange={(e) => setLateralKey(e.target.value)}
                      aria-label={t('lateralSystemLabel')}
                    >
                      {lateralSystems.map((s) => (
                        <option key={s.key} value={s.key}>
                          {lateralLabel(s.key)}
                        </option>
                      ))}
                    </select>
                    <ChevronDownIcon size={18} className={styles.selectChevron} />
                  </div>
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>{t('roofTypeLabel')}</span>
                  <div className={styles.selectWrap}>
                    <select
                      className={`${styles.select} tnum`}
                      value={roofKey}
                      onChange={(e) => setRoofKey(e.target.value)}
                      aria-label={t('roofTypeLabel')}
                    >
                      {ROOF_SYSTEMS.map((r) => (
                        <option key={r.key} value={r.key}>
                          {roofLabel(r.key)}
                        </option>
                      ))}
                    </select>
                    <ChevronDownIcon size={18} className={styles.selectChevron} />
                  </div>
                </label>
              </div>
              <div className={styles.fields}>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>
                    {t('floorAreaLabel')}
                    <span className={styles.fieldUnit}>({t('unitSqm')})</span>
                  </span>
                  <input
                    className={`${styles.input} tnum`}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder={t('example', { value: localizeDigits(120, locale) })}
                    value={areaInput}
                    onChange={(e) => setAreaInput(e.target.value)}
                    aria-label={t('floorAreaAria')}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>
                    {t('floorCountLabel')}
                    <span className={styles.fieldUnit}>({t('unitCount')})</span>
                  </span>
                  <input
                    className={`${styles.input} tnum`}
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder={t('example', { value: localizeDigits(4, locale) })}
                    value={floorsInput}
                    onChange={(e) => setFloorsInput(e.target.value)}
                    aria-label={t('floorCountLabel')}
                  />
                </label>
              </div>
            </>
          )}

          {result ? (
            <Text variant="caption" color="muted">
              {projectType === 'shed' ? t('totalAreaShed') : t('totalAreaOther')}:{' '}
              <span className="tnum">{faNum(result.totalArea, locale)}</span> {t('unitSqm')}
            </Text>
          ) : null}
        </Stack>
      </Card>

      {/* BOQ line items — announced politely (accessibility.md §4.3). */}
      <Card role="status" aria-live="polite" aria-atomic="true">
        {result ? (
          <Stack gap={5}>
            <Stack gap={3}>
              {result.kind === 'shed' ? (
                <MaterialRow
                  label={t('shedFrameLabel')}
                  weightKg={result.frameKg}
                  categoryOptions={frameCategoryOptions}
                  category={frameCategory}
                  onCategoryChange={onFrameCategoryChange}
                  rows={frameRows.rows}
                  skuId={frameSkuId}
                  onSkuChange={setFrameSkuId}
                  isLoading={frameRows.isLoading}
                />
              ) : (
                <>
                  <MaterialRow
                    label={t('rebarFrameLabel', { system: lateralLabel(result.system.key) })}
                    weightKg={result.frameKg}
                    categoryOptions={projectType === 'steel' ? frameCategoryOptions : undefined}
                    category={projectType === 'steel' ? frameCategory : undefined}
                    onCategoryChange={projectType === 'steel' ? onFrameCategoryChange : undefined}
                    rows={frameRows.rows}
                    skuId={frameSkuId}
                    onSkuChange={setFrameSkuId}
                    isLoading={frameRows.isLoading}
                  />
                  <MaterialRow
                    label={t('roofRebarLabel', { roof: roofLabel(result.roof.key) })}
                    weightKg={result.roofKg}
                    rows={roofRows.rows}
                    skuId={roofSkuId}
                    onSkuChange={setRoofSkuId}
                    isLoading={roofRows.isLoading}
                  />
                </>
              )}
            </Stack>

            {result.kind === 'concrete' ? (
              <div className={styles.metric}>
                <Text variant="overline" color="muted" as="p">
                  {t('concreteNeeded')}
                </Text>
                <p className={`${styles.metricValue} tnum`}>
                  <span className={styles.metricNum}>{faNum(result.concreteM3, locale, 1)}</span>
                  <span className={styles.metricUnit}>{t('unitM3')}</span>
                </p>
                <Text variant="caption" color="muted">
                  {t('concreteBasis', { value: localizedDecimal(CONCRETE_M3_PER_M2, locale) })}
                </Text>
              </div>
            ) : null}

            <div className={styles.divider} aria-hidden="true" />

            <div className={styles.cost}>
              <Text variant="overline" color="muted" as="p">
                {t('totalCostLabel')}
              </Text>
              {totalPricesLoading ? (
                <Text variant="body-sm" color="muted">
                  {t('fetchingPrices')}
                </Text>
              ) : totalCost !== null ? (
                <p className={`${styles.costValue} tnum`}>{formatToman(totalCost)}</p>
              ) : (
                <Text variant="body-sm" color="muted">
                  {t('noCostAvailable')}
                </Text>
              )}
            </div>
          </Stack>
        ) : (
          <div className={styles.placeholder}>
            <AiMarkIcon size={28} />
            <Text variant="body-sm" color="muted" align="center">
              {projectType === 'shed' ? t('placeholderShed') : t('placeholderOther')}
            </Text>
          </div>
        )}
      </Card>

      <Alert tone="warning" title={t('alertTitle')}>
        <Stack gap={4}>
          {/* Plain element, not <Text> — Text always sets color via inline
              style (higher specificity than the Alert's own inherited tone
              color), and none of Text's semantic TextColor options are pinned
              the same fixed way --amber-50 is, so any of them would flip to a
              too-light shade in dark mode against this permanently-light bg. */}
          <p className={styles.alertBody}>
            {projectType === 'concrete' && concreteBody}
            {projectType === 'steel' && steelBody}
            {projectType === 'shed' && t('disclaimerShed')}{' '}
            {t('askExpertSuffix')}
          </p>
          <Cluster gap={3}>
            <Link href={routes.ai()} className={styles.ctaPrimary} data-event="ai_entry">
              <AiMarkIcon size={18} /> {t('chatCta')}
            </Link>
            <Link href={routes.request()} className={styles.ctaSecondary}>
              {t('requestCta')} <ArrowEndIcon size={18} />
            </Link>
          </Cluster>
        </Stack>
      </Alert>
    </Stack>
  );
}

/** SystemOption keys use kebab-case ('moment-medium'); message keys are
 *  camelCase — this is the one place that bridges them. */
function camel(key: string): string {
  return key.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

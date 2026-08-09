'use client';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { routes } from '@/lib/routes';
import { toPersianDigits, normalizeDigits, formatToman } from '@/lib/utils/format';
import { Card, Stack, Cluster, Text, Alert } from '@/components/ui';
import { AiMarkIcon, ArrowEndIcon, ChevronDownIcon } from '@/components/primitives/icons';
import type { PriceRow } from '@/lib/types/domain';
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
 */

type ProjectType = 'concrete' | 'steel' | 'shed';
type SystemOption = { key: string; label: string; range: [number, number]; mid: number };
type CategoryOption = { slug: string; label: string };

/** اسکلت بتنی — وزن میلگرد بر مترمربع زیربنا، به تفکیک سیستم باربر جانبی
 *  (رادمان‌آهن). قاب خمشی+دیوار برشی رایج‌ترین سیستم مقاوم در برابر زلزله
 *  در ساختمان‌های بتنی ایران است — پیش‌فرض. */
const CONCRETE_LATERAL_SYSTEMS: SystemOption[] = [
  { key: 'shearwall', label: 'قاب خمشی + دیوار برشی', range: [35, 60], mid: 48 },
  { key: 'moment-medium', label: 'قاب خمشی متوسط', range: [40, 55], mid: 48 },
  { key: 'moment-special', label: 'قاب خمشی ویژه (مقاومت بالا در برابر زلزله)', range: [45, 70], mid: 58 },
];

/** اسکلت فلزی — وزن کل آهن‌آلات مصرفی بر مترمربع (ستون/تیر/بادبند/اتصالات
 *  با هم، بدون سقف)، به تفکیک سیستم باربر جانبی (رادمان‌آهن). مهاربندی
 *  هم‌مرکز به‌صرفه‌ترین و رایج‌ترین سیستم در ساختمان‌های میان‌مرتبه است —
 *  پیش‌فرض. */
const STEEL_LATERAL_SYSTEMS: SystemOption[] = [
  { key: 'cbf', label: 'مهاربندی هم‌مرکز (CBF)', range: [45, 70], mid: 58 },
  { key: 'ebf', label: 'مهاربندی غیرهم‌مرکز (EBF)', range: [50, 75], mid: 63 },
  { key: 'moment-medium', label: 'قاب خمشی متوسط', range: [65, 105], mid: 85 },
  { key: 'moment-special', label: 'قاب خمشی ویژه', range: [70, 115], mid: 93 },
  { key: 'dual', label: 'سیستم دوگانه', range: [70, 120], mid: 95 },
];

/** وزن آرماتور/فولاد سقف بر مترمربع، به تفکیک نوع سقف (رادمان‌آهن) —
 *  تیرچه‌بلوک اقتصادی‌ترین و رایج‌ترین سیستم سقف در اسکلت بتنی سبک ایران
 *  است؛ کامپوزیت (عرشهٔ فولادی) رایج‌ترین گزینه در اسکلت فلزی است. */
const ROOF_SYSTEMS: SystemOption[] = [
  { key: 'joist-block', label: 'تیرچه و بلوک', range: [5, 7], mid: 6 },
  { key: 'solid-slab', label: 'دال بتنی توپر', range: [10, 16], mid: 13 },
  { key: 'composite', label: 'کامپوزیت (عرشهٔ فولادی)', range: [8, 12], mid: 10 },
];

const STEEL_FRAME_CATEGORIES: CategoryOption[] = [
  { slug: 'ibeam', label: 'تیرآهن' },
  { slug: 'profile', label: 'پروفیل و قوطی' },
  { slug: 'angle-channel', label: 'نبشی و ناودانی' },
];
const SHED_FRAME_CATEGORIES: CategoryOption[] = [
  { slug: 'ibeam', label: 'تیرآهن' },
  { slug: 'profile', label: 'پروفیل و قوطی' },
];

/** بتن — اسکلت بتنی شامل فونداسیون، ستون، تیر و سقف: بازهٔ رایج ۰٫۳۵ تا ۰٫۵
 *  مترمکعب بر مترمربع، با ۰٫۴ به‌عنوان مقدار پراستنادترین منبع. بتن کالای
 *  کاتالوگ آهن‌تایم نیست — این خط صرفاً اطلاعاتی است، بدون انتخاب SKU. */
const CONCRETE_M3_RANGE: [number, number] = [0.35, 0.5];
const CONCRETE_M3_PER_M2 = 0.4;

/**
 * سوله — جدول برآورد وزن سوله تیرورقی (سازه‌نگار سینا)، محاسبه‌شده بر پایهٔ
 * بار برف ۱۰۰ کیلوگرم بر مترمربع (استاندارد تهران) و سرعت باد ۸۵ کیلومتر بر
 * ساعت — مناطق پرباربرف (مثلاً شمال کشور) به وزن به‌مراتب بیشتری نیاز دارند
 * (تا ۲۰۰ کیلوگرم بر مترمربع طبق سایر منابع). این عدد فقط اسکلت اصلی
 * (تیرورق/خرپا) است — پرلین، پوشش سقف/دیوار و فونداسیون جداست (به دلیل
 * وابستگی به فاصلهٔ پرلین/طراحی پوشش، سرانگشتی قابل استناد ندارد).
 */
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
const shedSpanLabel = (s: (typeof SHED_SPANS)[number]) =>
  `${toPersianDigits(s.span)} متر${s.columns > 0 ? ` (با ${toPersianDigits(s.columns)} ستون میانی)` : ' (بدون ستون میانی)'}`;
const shedOptionKey = (s: (typeof SHED_SPANS)[number]) => `${s.span}-${s.columns}`;

function parse(value: string): number {
  const n = Number(normalizeDigits(value).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function faNum(n: number, maxFrac = 1): string {
  const str = n
    .toLocaleString('en-US', { maximumFractionDigits: maxFrac })
    .replace(/,/g, '٬');
  return toPersianDigits(str);
}

/** For fixed decimal constants (e.g. 0.4 m³/m²) embedded in static disclaimer
 *  text — `toPersianDigits` alone leaves the "." as-is; every other
 *  hand-written Persian decimal on this site uses «٫». */
function faDecimal(n: number): string {
  return toPersianDigits(String(n)).replace('.', '٫');
}

function rangeText([min, max]: [number, number]): string {
  return `${toPersianDigits(min)} تا ${toPersianDigits(max)}`;
}

/** «میلگرد آجدار A2 ۱۸ (ذوب‌آهن اصفهان)» — grade/size/factory make a rebar
 *  SKU meaningfully different in price; a bare product name alone (identical
 *  across grades) would leave the select unusable. */
function skuLabel(row: PriceRow): string {
  const bits = [row.grade, row.size ? `سایز ${row.size}` : null, row.factory].filter(Boolean);
  return bits.length > 0 ? `${row.name} (${bits.join(' - ')})` : row.name;
}

function useCategoryRows(slug: string) {
  const { data, isLoading } = useQuery({
    queryKey: ['catalog', 'category-rows', slug],
    queryFn: () => api.catalog.category(slug),
    staleTime: 5 * 60 * 1000,
  });
  const rows = useMemo(
    () => (data?.rows ?? []).filter((r) => !r.current.priceHidden && r.current.price > 0),
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
  categories,
  category,
  onCategoryChange,
  rows,
  skuId,
  onSkuChange,
  isLoading,
}: {
  label: string;
  weightKg: number;
  categories?: CategoryOption[];
  category?: string;
  onCategoryChange?: (slug: string) => void;
  rows: PriceRow[];
  skuId: string;
  onSkuChange: (id: string) => void;
  isLoading: boolean;
}) {
  const selected = rows.find((r) => r.id === skuId) ?? null;
  const cost = selected ? weightKg * selected.current.price : null;

  return (
    <div className={styles.lineItem}>
      <div className={styles.lineItemHead}>
        <Text variant="label" as="span">
          {label}
        </Text>
        <Text variant="caption" color="muted">
          <span className="tnum">{faNum(weightKg)}</span> کیلوگرم
        </Text>
      </div>
      <div className={styles.lineItemFields}>
        {categories ? (
          <div className={styles.selectWrap}>
            <select
              className={`${styles.select} ${styles.selectSm} tnum`}
              value={category}
              onChange={(e) => onCategoryChange?.(e.target.value)}
              aria-label={`دستهٔ محصول برای ${label}`}
            >
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>
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
            aria-label={`مشخصات کالا برای ${label}`}
            disabled={rows.length === 0}
          >
            {rows.length === 0 ? (
              <option value="">{isLoading ? 'در حال بارگذاری…' : 'کالایی با قیمت روز موجود نیست'}</option>
            ) : (
              rows.map((r) => (
                <option key={r.id} value={r.id}>
                  {skuLabel(r)}
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
            در حال دریافت قیمت…
          </Text>
        ) : cost !== null ? (
          formatToman(cost)
        ) : (
          <Text variant="caption" color="muted">
            قیمت روز موجود نیست
          </Text>
        )}
      </div>
    </div>
  );
}

export function ProjectEstimator() {
  const [projectType, setProjectType] = useState<ProjectType>('concrete');
  const [areaInput, setAreaInput] = useState('');
  const [floorsInput, setFloorsInput] = useState('1');
  const [shedKey, setShedKey] = useState('');
  const [shedLengthInput, setShedLengthInput] = useState('');
  const [lateralKey, setLateralKey] = useState('shearwall');
  const [roofKey, setRoofKey] = useState('joist-block');
  const [frameCategory, setFrameCategory] = useState('ibeam');
  const [frameSkuId, setFrameSkuId] = useState('');
  const [roofSkuId, setRoofSkuId] = useState('');

  const rebarRows = useCategoryRows('rebar');
  const ibeamRows = useCategoryRows('ibeam');
  const profileRows = useCategoryRows('profile');
  const angleChannelRows = useCategoryRows('angle-channel');
  const categoryRows: Record<string, { rows: PriceRow[]; isLoading: boolean }> = {
    rebar: rebarRows,
    ibeam: ibeamRows,
    profile: profileRows,
    'angle-channel': angleChannelRows,
  };

  const area = parse(areaInput);
  const floors = Math.max(1, Math.round(parse(floorsInput)) || 1);
  const shedLength = parse(shedLengthInput);
  const shedSpan = SHED_SPANS.find((s) => shedOptionKey(s) === shedKey);

  const frameRows = projectType === 'concrete' ? rebarRows : categoryRows[frameCategory]!;
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

  const switchType = (t: ProjectType) => {
    setProjectType(t);
    setFrameSkuId('');
    setRoofSkuId('');
    if (t === 'concrete') {
      setLateralKey('shearwall');
      setRoofKey('joist-block');
    } else if (t === 'steel') {
      setLateralKey('cbf');
      setRoofKey('composite');
      setFrameCategory('ibeam');
    } else {
      setFrameCategory('ibeam');
    }
  };

  const onFrameCategoryChange = (slug: string) => {
    setFrameCategory(slug);
    setFrameSkuId('');
  };

  const lateralSystems = projectType === 'concrete' ? CONCRETE_LATERAL_SYSTEMS : STEEL_LATERAL_SYSTEMS;
  const frameCategoryOptions = projectType === 'steel' ? STEEL_FRAME_CATEGORIES : SHED_FRAME_CATEGORIES;

  return (
    <Stack gap={6}>
      <div className={styles.segmented} role="group" aria-label="نوع پروژه">
        <button
          type="button"
          aria-pressed={projectType === 'concrete'}
          className={styles.segment}
          data-active={projectType === 'concrete' ? '' : undefined}
          onClick={() => switchType('concrete')}
        >
          ساختمان بتنی
        </button>
        <button
          type="button"
          aria-pressed={projectType === 'steel'}
          className={styles.segment}
          data-active={projectType === 'steel' ? '' : undefined}
          onClick={() => switchType('steel')}
        >
          اسکلت فلزی
        </button>
        <button
          type="button"
          aria-pressed={projectType === 'shed'}
          className={styles.segment}
          data-active={projectType === 'shed' ? '' : undefined}
          onClick={() => switchType('shed')}
        >
          سوله صنعتی
        </button>
      </div>

      <Card>
        <Stack gap={5}>
          <Text variant="body-sm" color="muted">
            {projectType === 'shed'
              ? 'دهانهٔ سوله و طول کل سالن را وارد کنید تا برآورد اولیهٔ وزن اسکلت اصلی را ببینید.'
              : 'نوع سیستم باربر جانبی، نوع سقف، و متراژ پروژه را مشخص کنید تا برآورد جداگانهٔ اسکلت و سقف را ببینید.'}
          </Text>

          {projectType === 'shed' ? (
            <div className={styles.fields}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>دهانهٔ سوله</span>
                <div className={styles.selectWrap}>
                  <select
                    className={`${styles.select} tnum`}
                    value={shedKey}
                    onChange={(e) => setShedKey(e.target.value)}
                    aria-label="دهانهٔ سوله"
                  >
                    <option value="" disabled>
                      نزدیک‌ترین دهانه را انتخاب کنید
                    </option>
                    {SHED_SPANS.map((s) => (
                      <option key={shedOptionKey(s)} value={shedOptionKey(s)}>
                        {shedSpanLabel(s)}
                      </option>
                    ))}
                  </select>
                  <ChevronDownIcon size={18} className={styles.selectChevron} />
                </div>
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>
                  طول سالن
                  <span className={styles.fieldUnit}>(متر)</span>
                </span>
                <input
                  className={`${styles.input} tnum`}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="مثلاً ۴۰"
                  value={shedLengthInput}
                  onChange={(e) => setShedLengthInput(e.target.value)}
                  aria-label="طول سالن بر حسب متر"
                />
              </label>
            </div>
          ) : (
            <>
              <div className={styles.fields}>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>نوع سیستم باربر جانبی</span>
                  <div className={styles.selectWrap}>
                    <select
                      className={`${styles.select} tnum`}
                      value={lateralKey}
                      onChange={(e) => setLateralKey(e.target.value)}
                      aria-label="نوع سیستم باربر جانبی"
                    >
                      {lateralSystems.map((s) => (
                        <option key={s.key} value={s.key}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDownIcon size={18} className={styles.selectChevron} />
                  </div>
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>نوع سقف</span>
                  <div className={styles.selectWrap}>
                    <select
                      className={`${styles.select} tnum`}
                      value={roofKey}
                      onChange={(e) => setRoofKey(e.target.value)}
                      aria-label="نوع سقف"
                    >
                      {ROOF_SYSTEMS.map((r) => (
                        <option key={r.key} value={r.key}>
                          {r.label}
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
                    زیربنای هر طبقه
                    <span className={styles.fieldUnit}>(متر مربع)</span>
                  </span>
                  <input
                    className={`${styles.input} tnum`}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="مثلاً ۱۲۰"
                    value={areaInput}
                    onChange={(e) => setAreaInput(e.target.value)}
                    aria-label="زیربنای هر طبقه بر حسب متر مربع"
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>
                    تعداد طبقات
                    <span className={styles.fieldUnit}>(عدد)</span>
                  </span>
                  <input
                    className={`${styles.input} tnum`}
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="مثلاً ۴"
                    value={floorsInput}
                    onChange={(e) => setFloorsInput(e.target.value)}
                    aria-label="تعداد طبقات"
                  />
                </label>
              </div>
            </>
          )}

          {result ? (
            <Text variant="caption" color="muted">
              {projectType === 'shed' ? 'مساحت کل سوله' : 'سطح زیربنای کل'}:{' '}
              <span className="tnum">{faNum(result.totalArea)}</span> متر مربع
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
                  label="اسکلت اصلی سوله (تیرورق/خرپا)"
                  weightKg={result.frameKg}
                  categories={frameCategoryOptions}
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
                    label={`میلگرد اسکلت (${result.system.label})`}
                    weightKg={result.frameKg}
                    categories={projectType === 'steel' ? frameCategoryOptions : undefined}
                    category={projectType === 'steel' ? frameCategory : undefined}
                    onCategoryChange={projectType === 'steel' ? onFrameCategoryChange : undefined}
                    rows={frameRows.rows}
                    skuId={frameSkuId}
                    onSkuChange={setFrameSkuId}
                    isLoading={frameRows.isLoading}
                  />
                  <MaterialRow
                    label={`آرماتور سقف (${result.roof.label})`}
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
                  بتن موردنیاز
                </Text>
                <p className={`${styles.metricValue} tnum`}>
                  <span className={styles.metricNum}>{faNum(result.concreteM3, 1)}</span>
                  <span className={styles.metricUnit}>متر مکعب</span>
                </p>
                <Text variant="caption" color="muted">
                  بر پایهٔ {faDecimal(CONCRETE_M3_PER_M2)} مترمکعب در هر متر مربع — کالای کاتالوگ آهن‌تایم
                  نیست، صرفاً اطلاعاتی
                </Text>
              </div>
            ) : null}

            <div className={styles.divider} aria-hidden="true" />

            <div className={styles.cost}>
              <Text variant="overline" color="muted" as="p">
                جمع هزینهٔ تقریبی آهن‌آلات
              </Text>
              {totalPricesLoading ? (
                <Text variant="body-sm" color="muted">
                  در حال دریافت قیمت‌های لحظه‌ای…
                </Text>
              ) : totalCost !== null ? (
                <p className={`${styles.costValue} tnum`}>{formatToman(totalCost)}</p>
              ) : (
                <Text variant="body-sm" color="muted">
                  قیمت روز کالای انتخاب‌شده در دسترس نیست — برای برآورد هزینه با مشاور هوشمند گفتگو کنید.
                </Text>
              )}
            </div>
          </Stack>
        ) : (
          <div className={styles.placeholder}>
            <AiMarkIcon size={28} />
            <Text variant="body-sm" color="muted" align="center">
              {projectType === 'shed'
                ? 'دهانه و طول سالن را وارد کنید تا برآورد وزن اسکلت اصلی و هزینه نمایش داده شود.'
                : 'سیستم باربر جانبی، نوع سقف، زیربنا و تعداد طبقات را وارد کنید تا برآورد مصالح و هزینه نمایش داده شود.'}
            </Text>
          </div>
        )}
      </Card>

      <Alert tone="warning" title="برآورد اولیه">
        <Stack gap={4}>
          {/* Plain element, not <Text> — Text always sets color via inline
              style (higher specificity than the Alert's own inherited tone
              color), and none of Text's semantic TextColor options are pinned
              the same fixed way --amber-50 is, so any of them would flip to a
              too-light shade in dark mode against this permanently-light bg. */}
          <p className={styles.alertBody}>
            {projectType === 'concrete' &&
              `این اعداد بر پایهٔ منابع مهندسی عمران محاسبه شده‌اند: میلگرد اسکلت به تفکیک سیستم باربر جانبی (قاب خمشی+دیوار برشی ${rangeText(CONCRETE_LATERAL_SYSTEMS[0]!.range)}، قاب خمشی متوسط ${rangeText(CONCRETE_LATERAL_SYSTEMS[1]!.range)}، قاب خمشی ویژه ${rangeText(CONCRETE_LATERAL_SYSTEMS[2]!.range)} کیلوگرم بر مترمربع)، آرماتور سقف به تفکیک نوع سقف (تیرچه‌بلوک ${rangeText(ROOF_SYSTEMS[0]!.range)}، دال بتنی توپر ${rangeText(ROOF_SYSTEMS[1]!.range)} کیلوگرم بر مترمربع)، و بتن ${faDecimal(CONCRETE_M3_RANGE[0])} تا ${faDecimal(CONCRETE_M3_RANGE[1])} مترمکعب بر مترمربع. فونداسیون به شرایط خاک بستگی دارد و اینجا محاسبه نشده. این محاسبه جای محاسبات مهندسی را نمی‌گیرد.`}
            {projectType === 'steel' &&
              `این اعداد بر پایهٔ منابع مهندسی عمران محاسبه شده‌اند: آهن‌آلات اسکلت اصلی (ستون، تیر، بادبند و اتصالات با هم) به تفکیک سیستم باربر جانبی (مهاربندی هم‌مرکز ${rangeText(STEEL_LATERAL_SYSTEMS[0]!.range)}، غیرهم‌مرکز ${rangeText(STEEL_LATERAL_SYSTEMS[1]!.range)}، قاب خمشی متوسط ${rangeText(STEEL_LATERAL_SYSTEMS[2]!.range)}، قاب خمشی ویژه ${rangeText(STEEL_LATERAL_SYSTEMS[3]!.range)}، دوگانه ${rangeText(STEEL_LATERAL_SYSTEMS[4]!.range)} کیلوگرم بر مترمربع)، و آرماتور سقف به تفکیک نوع سقف (کامپوزیت ${rangeText(ROOF_SYSTEMS[2]!.range)}، تیرچه‌بلوک ${rangeText(ROOF_SYSTEMS[0]!.range)} کیلوگرم بر مترمربع — ورق عرشهٔ فولادی سقف کامپوزیت در این عدد نیست، جدا محاسبه می‌شود). فونداسیون به شرایط خاک بستگی دارد و اینجا محاسبه نشده. این محاسبه جای محاسبات مهندسی را نمی‌گیرد.`}
            {projectType === 'shed' &&
              'این عدد فقط اسکلت اصلی سوله (تیرورق/خرپا) را شامل می‌شود — بر پایهٔ جدول برآورد وزن سولهٔ تیرورقی، برای بار برف ۱۰۰ کیلوگرم بر مترمربع (استاندارد تهران) و سرعت باد ۸۵ کیلومتر بر ساعت. مناطق با بار برف بیشتر (مثلاً شمال کشور) به وزن اسکلت به‌مراتب بیشتری نیاز دارند — تا حدود ۲۰۰ کیلوگرم بر مترمربع. پرلین (پروفیل Z سقف)، پوشش سقف و دیوار، و فونداسیون در این برآورد نیامده — این اقلام به فاصلهٔ پرلین و طراحی پوشش بستگی دارند که بدون نقشهٔ اجرایی سرانگشتی قابل‌استنادی ندارند.'}{' '}
            برای عدد دقیق، با مشاور هوشمند گفتگو کنید.
          </p>
          <Cluster gap={3}>
            <Link href={routes.ai()} className={styles.ctaPrimary} data-event="ai_entry">
              <AiMarkIcon size={18} /> گفتگو با مشاور هوشمند
            </Link>
            <Link href={routes.request()} className={styles.ctaSecondary}>
              ثبت درخواست استعلام <ArrowEndIcon size={18} />
            </Link>
          </Cluster>
        </Stack>
      </Alert>
    </Stack>
  );
}

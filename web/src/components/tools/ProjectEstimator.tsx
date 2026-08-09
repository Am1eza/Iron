'use client';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { routes } from '@/lib/routes';
import { toPersianDigits, normalizeDigits, formatToman } from '@/lib/utils/format';
import { Card, Stack, Cluster, Text, Alert, Grid } from '@/components/ui';
import { AiMarkIcon, ArrowEndIcon, ChevronDownIcon } from '@/components/primitives/icons';
import styles from './ProjectEstimator.module.css';

/**
 * برآورد آهن‌آلات پروژه — rule-of-thumb material take-off, one profile per
 * real project shape (not one formula pretending to fit all of them).
 *
 * audit-2026-08-09 (Amir): the previous version modeled exactly ONE project
 * type — a multi-story concrete-frame building (زیربنا × طبقات → میلگرد و
 * بتن) — under a generic "برآورد آهن‌آلات پروژه" name. That's wrong for two
 * whole classes of real project:
 *  - اسکلت فلزی (steel-frame building): still floor-based, but needs
 *    تیرآهن (its primary structural material) IN ADDITION to a reduced
 *    میلگرد figure (foundation/slab only) — the old version never asked.
 *  - سوله (industrial shed / portal frame): not floor-based AT ALL — it's
 *    span-and-length-based (a سوله is normally single-story), and its
 *    primary material is structural steel, not میلگرد+بتن. Forcing a
 *    «تعداد طبقات» input on a سوله customer and then quoting them rebar
 *    and concrete is actively misleading, not just imprecise.
 *
 * Coefficients below are cross-checked against multiple independent Iranian
 * civil-engineering references (اصفهان‌آهن، مستر آهن، کارکشته، رادمان آهن،
 * فولاد ایرانیان، آکادمی عمران، سازه‌نگار سینا — 2026-08-09), not invented.
 * Every one is shown as the RANGE those sources actually give, not a bare
 * single number dressed up as precise — the calculation itself uses the
 * range's representative midpoint. See each constant below for its range
 * and source basis.
 *
 * Average prices (میلگرد، تیرآهن) are fetched live via `api.catalog` (same
 * client `PriceTable`/`BulkQuote`/`WeightCalculator` already use) — this
 * used to read `@/lib/mock/catalogData`'s seeded-PRNG fixture prices
 * unconditionally, the same bug already fixed for `/tools/cost` in #99.
 */

type ProjectType = 'concrete' | 'steel' | 'shed';

/** میلگرد — اسکلت بتنی: منابع متعدد ۳۵ تا ۵۰ کیلوگرم بر مترمربع زیربنا کل
 *  را ذکر می‌کنند (مثلاً کارکشته: «۳۵ تا ۵۰»؛ مستر آهن: «۳۵ تا ۶۰»). عدد
 *  محاسبه (۵۰) انتهای بالای این بازه‌ست — از قبل هم همین بود، عوض نشده. */
const CONCRETE_REBAR_RANGE: [number, number] = [35, 50];
const CONCRETE_REBAR_KG_PER_M2 = 50;

/** بتن — اسکلت بتنی شامل فونداسیون، ستون، تیر و سقف: بازهٔ رایج ۰٫۳ تا ۰٫۵
 *  مترمکعب بر مترمربع (آکادمی عمران)، با ۰٫۴ به‌عنوان مقدار پراستنادترین
 *  منبع (پاسخ آماده گوگل: «حدود ۰٫۴ مترمکعب به ازای هر مترمربع زیربنا»). */
const CONCRETE_M3_RANGE: [number, number] = [0.35, 0.5];
const CONCRETE_M3_PER_M2 = 0.4;

/** میلگرد — اسکلت فلزی (فقط فونداسیون و سقف، نه ستون/تیر که فولادی‌اند):
 *  «۴۵ تا ۶۵ کیلوگرم» (تهران‌آهن). میانهٔ بازه. */
const STEEL_REBAR_RANGE: [number, number] = [45, 65];
const STEEL_REBAR_KG_PER_M2 = 55;

/** تیرآهن — اسکلت فلزی با مهاربندی (متداول‌ترین نوع، نه قاب خمشی که سنگین‌تره):
 *  چند منبع مستقل «۴۰ تا ۷۰» یا «۴۵ تا ۷۰» ذکر می‌کنند (کارکشته، رادمان‌آهن،
 *  فولاد ایرانیان). میانهٔ بازه. */
const STEEL_IBEAM_RANGE: [number, number] = [40, 70];
const STEEL_IBEAM_KG_PER_M2 = 55;

/**
 * سوله — جدول برآورد وزن سوله تیرورقی (سازه‌نگار سینا)، محاسبه‌شده بر پایهٔ
 * بار برف ۱۰۰ کیلوگرم بر مترمربع (استاندارد تهران) و سرعت باد ۸۵ کیلومتر بر
 * ساعت — مناطق پرباربرف (مثلاً شمال کشور) به وزن به‌مراتب بیشتری نیاز دارند
 * (تا ۲۰۰ کیلوگرم بر مترمربع طبق سایر منابع)، که این ابزار صریحاً هشدار
 * می‌دهد نه ادعای پوشش آن. دهانه‌های نامنظم (۴۰ متری سنگین‌تر از ۵۰/۶۰ متری)
 * واقعی‌اند — با تعداد ستون میانی توضیح داده می‌شوند، نه گرد کردن اشتباه.
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

/** Live category average price (Toman/kg), excluding stale/hidden rows (a
 *  hidden row's `current.price` is a `0` sentinel — see catalogRepo.
 *  toPriceRow — folding it into the mean would silently drag it toward 0). */
function useAvgPrice(categorySlug: string) {
  const { data, isLoading } = useQuery({
    queryKey: ['catalog', 'category-rows', categorySlug],
    queryFn: () => api.catalog.category(categorySlug),
    staleTime: 5 * 60 * 1000,
  });
  const avg = useMemo(() => {
    const rows = (data?.rows ?? []).filter((r) => !r.current.priceHidden && r.current.price > 0);
    if (rows.length === 0) return null;
    return Math.round(rows.reduce((sum, r) => sum + r.current.price, 0) / rows.length);
  }, [data]);
  return { avg, isLoading };
}

export function ProjectEstimator() {
  const [projectType, setProjectType] = useState<ProjectType>('concrete');
  const [areaInput, setAreaInput] = useState('');
  const [floorsInput, setFloorsInput] = useState('1');
  const [shedKey, setShedKey] = useState('');
  const [shedLengthInput, setShedLengthInput] = useState('');

  const { avg: avgRebarPrice, isLoading: rebarLoading } = useAvgPrice('rebar');
  const { avg: avgIbeamPrice, isLoading: ibeamLoading } = useAvgPrice('ibeam');

  const area = parse(areaInput);
  const floors = Math.max(1, Math.round(parse(floorsInput)) || 1);
  const shedLength = parse(shedLengthInput);
  const shedSpan = SHED_SPANS.find((s) => shedOptionKey(s) === shedKey);

  const result = useMemo(() => {
    if (projectType === 'shed') {
      if (!shedSpan || shedLength <= 0) return null;
      const totalArea = shedSpan.span * shedLength;
      const steelKg = totalArea * shedSpan.kgPerM2;
      return {
        kind: 'shed' as const,
        totalArea,
        steelTon: steelKg / 1000,
        steelKg,
        steelCost: avgIbeamPrice ? steelKg * avgIbeamPrice : null,
      };
    }

    const totalArea = area * floors;
    if (totalArea <= 0) return null;

    if (projectType === 'steel') {
      const rebarKg = totalArea * STEEL_REBAR_KG_PER_M2;
      const ibeamKg = totalArea * STEEL_IBEAM_KG_PER_M2;
      return {
        kind: 'steel' as const,
        totalArea,
        rebarTon: rebarKg / 1000,
        rebarKg,
        ibeamTon: ibeamKg / 1000,
        ibeamKg,
        rebarCost: avgRebarPrice ? rebarKg * avgRebarPrice : null,
        ibeamCost: avgIbeamPrice ? ibeamKg * avgIbeamPrice : null,
      };
    }

    const rebarKg = totalArea * CONCRETE_REBAR_KG_PER_M2;
    const concreteM3 = totalArea * CONCRETE_M3_PER_M2;
    return {
      kind: 'concrete' as const,
      totalArea,
      rebarTon: rebarKg / 1000,
      rebarKg,
      concreteM3,
      rebarCost: avgRebarPrice ? rebarKg * avgRebarPrice : null,
    };
  }, [projectType, area, floors, shedSpan, shedLength, avgRebarPrice, avgIbeamPrice]);

  const switchType = (t: ProjectType) => {
    setProjectType(t);
  };

  const pricesLoading =
    (projectType === 'shed' && ibeamLoading) ||
    (projectType === 'steel' && (rebarLoading || ibeamLoading)) ||
    (projectType === 'concrete' && rebarLoading);

  return (
    <Stack gap={6}>
      <div
        className={styles.segmented}
        role="group"
        aria-label="نوع پروژه"
      >
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

      <div className={styles.layout}>
        {/* Inputs */}
        <Card className={styles.panel}>
          <Stack gap={5}>
            <Text variant="body-sm" color="muted">
              {projectType === 'shed'
                ? 'دهانهٔ سوله و طول کل سالن را وارد کنید تا برآورد اولیهٔ وزن اسکلت فولادی را ببینید.'
                : 'زیربنای هر طبقه و تعداد طبقات را وارد کنید تا برآورد اولیهٔ مصالح را ببینید.'}
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
            )}

            {result ? (
              <Text variant="caption" color="muted">
                {projectType === 'shed' ? 'مساحت کل سوله' : 'سطح زیربنای کل'}:{' '}
                <span className="tnum">{faNum(result.totalArea)}</span> متر مربع
              </Text>
            ) : null}
          </Stack>
        </Card>

        {/* Results — announced politely (accessibility.md §4.3) so the estimate
            is heard without re-reading the whole panel on every keystroke. */}
        <Card className={styles.result} role="status" aria-live="polite" aria-atomic="true">
          {result ? (
            <Stack gap={5}>
              {result.kind === 'shed' ? (
                <Grid min="150px" gap={4}>
                  <div className={styles.metric}>
                    <Text variant="overline" color="muted" as="p">
                      وزن اسکلت فولادی
                    </Text>
                    <p className={`${styles.metricValue} tnum`}>
                      <span className={styles.metricNum}>{faNum(result.steelTon, 2)}</span>
                      <span className={styles.metricUnit}>تن</span>
                    </p>
                    <Text variant="caption" color="muted">
                      ≈ <span className="tnum">{faNum(result.steelKg)}</span> کیلوگرم
                    </Text>
                  </div>
                </Grid>
              ) : result.kind === 'steel' ? (
                <Grid min="150px" gap={4}>
                  <div className={styles.metric}>
                    <Text variant="overline" color="muted" as="p">
                      میلگرد موردنیاز (فونداسیون و سقف)
                    </Text>
                    <p className={`${styles.metricValue} tnum`}>
                      <span className={styles.metricNum}>{faNum(result.rebarTon, 2)}</span>
                      <span className={styles.metricUnit}>تن</span>
                    </p>
                    <Text variant="caption" color="muted">
                      ≈ <span className="tnum">{faNum(result.rebarKg)}</span> کیلوگرم
                    </Text>
                  </div>
                  <div className={styles.metric}>
                    <Text variant="overline" color="muted" as="p">
                      تیرآهن موردنیاز (ستون و تیر اصلی)
                    </Text>
                    <p className={`${styles.metricValue} tnum`}>
                      <span className={styles.metricNum}>{faNum(result.ibeamTon, 2)}</span>
                      <span className={styles.metricUnit}>تن</span>
                    </p>
                    <Text variant="caption" color="muted">
                      ≈ <span className="tnum">{faNum(result.ibeamKg)}</span> کیلوگرم
                    </Text>
                  </div>
                </Grid>
              ) : (
                <Grid min="150px" gap={4}>
                  <div className={styles.metric}>
                    <Text variant="overline" color="muted" as="p">
                      میلگرد موردنیاز
                    </Text>
                    <p className={`${styles.metricValue} tnum`}>
                      <span className={styles.metricNum}>{faNum(result.rebarTon, 2)}</span>
                      <span className={styles.metricUnit}>تن</span>
                    </p>
                    <Text variant="caption" color="muted">
                      ≈ <span className="tnum">{faNum(result.rebarKg)}</span> کیلوگرم
                    </Text>
                  </div>
                  <div className={styles.metric}>
                    <Text variant="overline" color="muted" as="p">
                      بتن موردنیاز
                    </Text>
                    <p className={`${styles.metricValue} tnum`}>
                      <span className={styles.metricNum}>{faNum(result.concreteM3, 1)}</span>
                      <span className={styles.metricUnit}>متر مکعب</span>
                    </p>
                    <Text variant="caption" color="muted">
                      بر پایهٔ {faDecimal(CONCRETE_M3_PER_M2)} مترمکعب در هر متر مربع
                    </Text>
                  </div>
                </Grid>
              )}

              <div className={styles.divider} aria-hidden="true" />

              {result.kind === 'steel' ? (
                <div className={styles.cost}>
                  <Text variant="overline" color="muted" as="p">
                    هزینهٔ تقریبی میلگرد و تیرآهن
                  </Text>
                  {pricesLoading ? (
                    <Text variant="body-sm" color="muted">
                      در حال دریافت قیمت‌های لحظه‌ای…
                    </Text>
                  ) : result.rebarCost !== null && result.ibeamCost !== null ? (
                    <>
                      <p className={`${styles.costValue} tnum`}>
                        {formatToman(result.rebarCost + result.ibeamCost)}
                      </p>
                      <Text variant="caption" color="muted">
                        میلگرد با میانگین <span className="tnum">{formatToman(avgRebarPrice ?? 0, false)}</span>{' '}
                        و تیرآهن با میانگین <span className="tnum">{formatToman(avgIbeamPrice ?? 0, false)}</span>{' '}
                        تومان بر کیلوگرم
                      </Text>
                    </>
                  ) : (
                    <Text variant="body-sm" color="muted">
                      قیمت روز میلگرد یا تیرآهن در دسترس نیست — برای برآورد هزینه با مشاور هوشمند گفتگو کنید.
                    </Text>
                  )}
                </div>
              ) : (
                <div className={styles.cost}>
                  <Text variant="overline" color="muted" as="p">
                    {projectType === 'shed' ? 'هزینهٔ تقریبی اسکلت فولادی' : 'هزینهٔ تقریبی میلگرد'}
                  </Text>
                  {pricesLoading ? (
                    <Text variant="body-sm" color="muted">
                      در حال دریافت قیمت لحظه‌ای…
                    </Text>
                  ) : result.kind === 'shed' ? (
                    result.steelCost !== null ? (
                      <>
                        <p className={`${styles.costValue} tnum`}>{formatToman(result.steelCost)}</p>
                        <Text variant="caption" color="muted">
                          بر پایهٔ میانگین قیمت روز تیرآهن (
                          <span className="tnum">{formatToman(avgIbeamPrice ?? 0, false)}</span> تومان بر
                          کیلوگرم) — تقریبی، چون اسکلت واقعی سوله ترکیبی از تیرآهن/تیرورق و نبشی است
                        </Text>
                      </>
                    ) : (
                      <Text variant="body-sm" color="muted">
                        قیمت روز تیرآهن در دسترس نیست — برای برآورد هزینه با مشاور هوشمند گفتگو کنید.
                      </Text>
                    )
                  ) : result.rebarCost !== null ? (
                    <>
                      <p className={`${styles.costValue} tnum`}>{formatToman(result.rebarCost)}</p>
                      <Text variant="caption" color="muted">
                        با میانگین قیمت روز میلگرد (
                        <span className="tnum">{formatToman(avgRebarPrice ?? 0, false)}</span> تومان بر
                        کیلوگرم)
                      </Text>
                    </>
                  ) : (
                    <Text variant="body-sm" color="muted">
                      قیمت روز میلگرد در دسترس نیست — برای برآورد هزینه با مشاور هوشمند گفتگو کنید.
                    </Text>
                  )}
                </div>
              )}
            </Stack>
          ) : (
            <div className={styles.placeholder}>
              <AiMarkIcon size={28} />
              <Text variant="body-sm" color="muted" align="center">
                {projectType === 'shed'
                  ? 'دهانه و طول سالن را وارد کنید تا برآورد وزن اسکلت فولادی و هزینه نمایش داده شود.'
                  : 'زیربنا و تعداد طبقات را وارد کنید تا برآورد میلگرد، بتن و هزینه نمایش داده شود.'}
              </Text>
            </div>
          )}
        </Card>
      </div>

      <Alert tone="warning" title="برآورد اولیه">
        <Stack gap={4}>
          {/* Plain element, not <Text> — Text always sets color via inline
              style (higher specificity than the Alert's own inherited tone
              color), and none of Text's semantic TextColor options are pinned
              the same fixed way --amber-50 is, so any of them would flip to a
              too-light shade in dark mode against this permanently-light bg. */}
          <p className={styles.alertBody}>
            {projectType === 'concrete' &&
              `این اعداد بر پایهٔ ضرایب سرانگشتی رایج صنعت ساختمان محاسبه شده‌اند: میلگرد ${toPersianDigits(CONCRETE_REBAR_RANGE[0])} تا ${toPersianDigits(CONCRETE_REBAR_RANGE[1])} کیلوگرم و بتن ${faDecimal(CONCRETE_M3_RANGE[0])} تا ${faDecimal(CONCRETE_M3_RANGE[1])} مترمکعب در هر متر مربع زیربنا (برای اسکلت بتنی). این محاسبه فقط برای ساختمان با اسکلت بتنی معتبر است و جای محاسبات مهندسی را نمی‌گیرد.`}
            {projectType === 'steel' &&
              `این اعداد بر پایهٔ ضرایب سرانگشتی رایج صنعت ساختمان محاسبه شده‌اند: میلگرد فونداسیون و سقف ${toPersianDigits(STEEL_REBAR_RANGE[0])} تا ${toPersianDigits(STEEL_REBAR_RANGE[1])} کیلوگرم و تیرآهن اسکلت اصلی ${toPersianDigits(STEEL_IBEAM_RANGE[0])} تا ${toPersianDigits(STEEL_IBEAM_RANGE[1])} کیلوگرم در هر متر مربع زیربنا (اسکلت فلزی با مهاربندی معمولی؛ قاب خمشی می‌تواند سنگین‌تر باشد). بتن فونداسیون به شرایط خاک بستگی دارد و اینجا محاسبه نشده — این محاسبه جای محاسبات مهندسی را نمی‌گیرد.`}
            {projectType === 'shed' &&
              'این اعداد بر پایهٔ جدول برآورد وزن سولهٔ تیرورقی، برای بار برف ۱۰۰ کیلوگرم بر مترمربع (استاندارد تهران) و سرعت باد ۸۵ کیلومتر بر ساعت محاسبه شده‌اند. مناطق با بار برف بیشتر (مثلاً شمال کشور) به وزن اسکلت به‌مراتب بیشتری نیاز دارند — تا حدود ۲۰۰ کیلوگرم بر مترمربع. فونداسیون سوله و پوشش سقف/دیوار در این برآورد نیامده و جدا محاسبه می‌شود.'}{' '}
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

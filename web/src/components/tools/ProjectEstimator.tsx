'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { getRows } from '@/lib/mock/catalogData';
import { routes } from '@/lib/routes';
import { toPersianDigits, normalizeDigits, formatToman } from '@/lib/utils/format';
import { Card, Stack, Cluster, Text, Alert, Grid } from '@/components/ui';
import { SparkIcon, ArrowEndIcon } from '@/components/primitives/icons';
import styles from './ProjectEstimator.module.css';

/**
 * برآورد پروژه — rule-of-thumb material take-off from built area. Gives an early
 * sense of میلگرد tonnage, بتن volume and an approximate میلگرد cost using the
 * average current میلگرد price. Explicitly framed as a starting estimate that
 * funnels to the AI advisor / inquiry for a precise figure.
 */

const REBAR_KG_PER_M2 = 50; // ~50 kg میلگرد per m² of total built area
const CONCRETE_M3_PER_M2 = 0.35; // ~0.35 m³ بتن per m²

/** Average current میلگرد price (Toman/kg) — derived from seeded catalog (deterministic). */
const AVG_REBAR_PRICE: number = (() => {
  const rows = getRows('rebar');
  if (rows.length === 0) return 0;
  const sum = rows.reduce((acc, r) => acc + r.current.price, 0);
  return Math.round(sum / rows.length);
})();

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

export function ProjectEstimator() {
  const [areaInput, setAreaInput] = useState('');
  const [floorsInput, setFloorsInput] = useState('1');

  const area = parse(areaInput);
  const floors = Math.max(1, Math.round(parse(floorsInput)) || 1);

  const result = useMemo(() => {
    const totalArea = area * floors;
    if (totalArea <= 0) return null;
    const rebarKg = totalArea * REBAR_KG_PER_M2;
    const rebarTon = rebarKg / 1000;
    const concreteM3 = totalArea * CONCRETE_M3_PER_M2;
    const rebarCost = rebarKg * AVG_REBAR_PRICE;
    return { totalArea, rebarKg, rebarTon, concreteM3, rebarCost };
  }, [area, floors]);

  return (
    <Stack gap={6}>
      <div className={styles.layout}>
        {/* Inputs */}
        <Card className={styles.panel}>
          <Stack gap={5}>
            <Text variant="body-sm" color="muted">
              زیربنای هر طبقه و تعداد طبقات را وارد کنید تا برآورد اولیهٔ مصالح را
              ببینید.
            </Text>
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

            {result ? (
              <Text variant="caption" color="muted">
                سطح زیربنای کل:{' '}
                <span className="tnum">{faNum(result.totalArea)}</span> متر مربع
              </Text>
            ) : null}
          </Stack>
        </Card>

        {/* Results */}
        <Card className={styles.result}>
          {result ? (
            <Stack gap={5}>
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
                    بر پایهٔ ۰٫۳۵ مترمکعب در هر متر مربع
                  </Text>
                </div>
              </Grid>

              <div className={styles.divider} aria-hidden="true" />

              <div className={styles.cost}>
                <Text variant="overline" color="muted" as="p">
                  هزینهٔ تقریبی میلگرد
                </Text>
                <p className={`${styles.costValue} tnum`}>
                  {formatToman(result.rebarCost)}
                </p>
                <Text variant="caption" color="muted">
                  با میانگین قیمت روز میلگرد (
                  <span className="tnum">{formatToman(AVG_REBAR_PRICE, false)}</span>{' '}
                  تومان بر کیلوگرم)
                </Text>
              </div>
            </Stack>
          ) : (
            <div className={styles.placeholder}>
              <SparkIcon size={28} />
              <Text variant="body-sm" color="muted" align="center">
                زیربنا و تعداد طبقات را وارد کنید تا برآورد میلگرد، بتن و هزینه نمایش
                داده شود.
              </Text>
            </div>
          )}
        </Card>
      </div>

      <Alert tone="warning" title="برآورد اولیه">
        <Stack gap={4}>
          <Text variant="body-sm">
            این اعداد بر پایهٔ ضرایب سرانگشتی (میلگرد حدود ۵۰ کیلوگرم و بتن حدود
            ۰٫۳۵ مترمکعب در هر متر مربع زیربنا) محاسبه شده‌اند و جای محاسبات مهندسی
            را نمی‌گیرند. برای قیمت دقیق با مشاور هوشمند گفتگو کنید.
          </Text>
          <Cluster gap={3}>
            <Link href={routes.ai()} className={styles.ctaPrimary} data-event="ai_entry">
              <SparkIcon size={18} /> گفتگو با مشاور هوشمند
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

'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/lib/hooks/useToast';
import { useCartStore } from '@/lib/stores/cart';
import { useRequestsStore } from '@/lib/stores/requests';
import { useRequireAuth } from '@/lib/hooks/useRequireAuth';
import { routes } from '@/lib/routes';
import { formatToman, toPersianDigits } from '@/lib/utils/format';
import { sizeLabel } from '@/lib/utils/catalogLabels';
import { getRows } from '@/lib/mock/catalogData';
import { computeBulkSplit, pickBestGroup } from '@/lib/utils/bulkSplit';
import { MOCK_CATEGORY_SUBS, type SubCat } from '@/lib/data/nav';
import { FactoryLink } from './FactoryLink';
import { DEFAULT_LOGISTICS_CONFIG, cityDistance, estimateLogistics, type LogisticsConfig } from '@/lib/data/logistics';
import { useProfileStore } from '@/lib/stores/profile';
import { CONSTANTS } from '@/lib/config/constants';
import type { PriceRow } from '@/lib/types/domain';
import { PlusIcon, CheckCircleIcon } from '@/components/primitives/icons';
import styles from './BulkQuote.module.css';

// Re-exported so existing imports (AI advisor) keep working from one place.
export { computeBulkSplit } from '@/lib/utils/bulkSplit';
export type { BulkSplit, FactoryLine } from '@/lib/utils/bulkSplit';

const TONNAGE_PRESETS = [10, 20, 50, 100];

/**
 * «مقایسهٔ کارخانه‌ها» — the signature capability. Enter a tonnage and see the
 * same product priced across every mill: proportional price bars, the gap to the
 * cheapest, and what you save by choosing it. Anchored at #compare so the
 * landing teaser, the table toolbar and the cascade menu can deep-link here.
 */
export function BulkQuote({
  category,
  categoryName,
  rows: rowsProp,
  subs: subsProp,
  defaultSub,
  defaultSize,
  defaultTonnage = 20,
  logisticsConfig = DEFAULT_LOGISTICS_CONFIG,
  vatRate = CONSTANTS.VAT_RATE,
}: {
  category: string;
  categoryName: string;
  rows?: PriceRow[];
  /** Live sub-categories (server-provided) — fixture fallback is mock/dev only. */
  subs?: SubCat[];
  /** The sub-category this panel should OPEN on, when the host page is about
   *  one specific product (the SKU page). Without it the panel falls back to
   *  `pickBestGroup`, which picks whichever sub-category the most mills quote
   *  — on a وال‌پست page that is «نبشی», so the "compare" panel silently
   *  answered a question about a different product than the one on screen. */
  defaultSub?: string;
  /** Likewise for size, so the SKU page's comparison is same-size where the
   *  data supports it. Cleared automatically if that size isn't quoted in the
   *  seeded sub-category, so seeding can never empty the panel. */
  defaultSize?: string;
  defaultTonnage?: number;
  /** Admin-configurable freight/insurance/handling rates + city list, fetched
   *  server-side from `settings.LOGISTICS` and passed down — falls back to
   *  the same defaults `landedCost` uses when a caller doesn't have it yet. */
  logisticsConfig?: LogisticsConfig;
  /** Live admin-configured VAT rate (`settings.VAT_RATE`, via `getVatRate()`)
   *  — server-provided so this stays in sync with `landedCost`, which already
   *  uses the live rate. Falls back to the static default only for callers
   *  that don't have it yet. */
  vatRate?: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const add = useCartStore((s) => s.add);
  const addRequest = useRequestsStore((s) => s.add);
  const { requireAuth } = useRequireAuth();
  const [tonnage, setTonnage] = useState<number>(defaultTonnage);
  const [sub, setSub] = useState<string>(defaultSub ?? '');
  const sizeCol = sizeLabel(category, sub || null);
  const [size, setSize] = useState<string>('');
  const warehouseCity = useProfileStore((s) => s.warehouseCity);
  const setWarehouseCity = useProfileStore((s) => s.setWarehouseCity);
  const city = warehouseCity ?? 'تهران';

  const allRows = useMemo(() => rowsProp ?? getRows(category), [rowsProp, category]);
  // Live subs come from the server page; the fixture is the mock/dev fallback.
  const subs = subsProp ?? MOCK_CATEGORY_SUBS[category] ?? [];

  // Averaging a mill's price across entirely different sub-categories (e.g.
  // میلگرد «ساده» blended with «آجدار A3») blends non-equivalent products
  // into a misleading "cheapest" — so instead of opening on the unfiltered
  // (blended) view, default to the single most-quoted sub-category the
  // moment rows are available. The user can still pick «همه» explicitly for
  // the broader, averaged view. Deliberately doesn't also auto-pick a size:
  // real data showed one exact size is often quoted by only one mill, which
  // would collapse the comparison to a single factory almost every time.
  //
  // When the host page IS one specific product (`defaultSub`), that product's
  // own sub-category wins outright — auto-picking is for the category/landing
  // surfaces, which have no product to be about.
  const [autoPicked, setAutoPicked] = useState(false);
  useEffect(() => {
    if (autoPicked || allRows.length === 0) return;
    if (defaultSub) {
      // Seeded from the product itself; nothing to infer.
      setAutoPicked(true);
      return;
    }
    const group = pickBestGroup(allRows);
    if (group?.subCategoryId) setSub(group.subCategoryId);
    setAutoPicked(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows, autoPicked, defaultSub]);

  // Size-aware comparison: same sub-family AND same size across mills — an
  // apples-to-apples benchmark instead of category averages.
  const subRows = useMemo(
    () => (sub ? allRows.filter((r) => r.subCategoryId === sub) : allRows),
    [allRows, sub],
  );
  const sizes = useMemo(
    () => [...new Set(subRows.map((r) => r.size).filter((s): s is string => Boolean(s)))],
    [subRows],
  );
  const rows = useMemo(
    () => (size ? subRows.filter((r) => r.size === size) : subRows),
    [subRows, size],
  );

  // Seed the size from the host product, but only once the seeded
  // sub-category's sizes are known and only if this size is actually quoted
  // there — otherwise the panel would open on an empty comparison.
  const [sizeSeeded, setSizeSeeded] = useState(false);
  useEffect(() => {
    if (sizeSeeded || !defaultSize) return;
    if (sizes.length === 0) return;
    if (sizes.includes(defaultSize)) setSize(defaultSize);
    setSizeSeeded(true);
  }, [sizeSeeded, defaultSize, sizes]);

  const split = useMemo(() => computeBulkSplit(rows, tonnage), [rows, tonnage]);

  // Nothing to compare, and — for پروفیل — nobody to compare. This whole panel
  // asks one question ("which mill is cheapest for N tonnes?"), so on a
  // category whose rows carry no mill it has no question to ask: every row
  // would fall into one «سایر» bucket and the page would recommend «تأمین از
  // کارخانهٔ سایر», which is the fabricated distinction wearing a different
  // name. It reappears by itself the moment a real factory is priced here.
  if (allRows.length === 0 || !allRows.some((r) => r.factory)) return null;

  // W25 audit fix: this panel prices «تناژ × قیمت هر کیلوگرم», which is only
  // meaningful for kg-priced products. On a per-قطعه / per-کلاف / per-برگ /
  // per-متر-مربع product (47 active SKUs) a tonnage has no relationship to
  // the stored price at all, so there is no honest number to show and the
  // panel removes itself rather than invent one. `computeBulkSplit` drops
  // those rows too, so this is the visible half of the same rule.
  if (!allRows.some((r) => !r.current.priceHidden && (r.current.priceBasis ?? r.priceBasis ?? 'kg') === 'kg')) {
    return null;
  }

  const most = split.lines[split.lines.length - 1] ?? null;
  const runnerUp = split.lines.find((l) => l.factory !== split.cheapest?.factory) ?? null;
  // Two DIFFERENT numbers, kept explicitly distinct (and distinctly worded
  // below) so they never get conflated: how much you save vs the very next
  // option — the AI advisor quotes this exact same figure — and the wider
  // gap to the priciest option, for full context.
  const savingsVsNext = split.cheapest && runnerUp ? runnerUp.lineToman - split.cheapest.lineToman : 0;
  const savingsVsMax =
    split.cheapest && most && most.factory !== split.cheapest.factory
      ? most.lineToman - split.cheapest.lineToman
      : 0;

  // Landed cost from the Shadabad warehouse to the buyer's city. Fallback km
  // and VAT rate match `landedCost` (estimate.service.ts) exactly — an
  // unmatched city or a stale VAT constant used to quote a cheaper estimate
  // here than the server would actually charge.
  const km = cityDistance(city, logisticsConfig.cities) ?? 150;
  const landed = split.cheapest
    ? estimateLogistics(split.tonnage, km, split.cheapest.lineToman, vatRate, logisticsConfig)
    : null;

  const addToInquiry = () => {
    const best = split.cheapest;
    if (!best) return;
    add({
      skuId: `bulk-${category}-${best.factory}`,
      name: `${categoryName} عمده، کارخانهٔ ${best.factory}`,
      qty: split.totalKg,
      unit: 'kg',
      unitPrice: best.pricePerKg,
      weightKg: split.totalKg,
    });
    toast.success('استعلام عمده به سبد اضافه شد.', {
      label: 'مشاهده سبد',
      href: routes.cart(),
    });
  };

  return (
    <section id="compare" className={styles.panel} aria-labelledby="bulk-title">
      <header className={styles.head}>
        <div>
          <h2 id="bulk-title" className={styles.title}>
            مقایسهٔ کارخانه‌ها
          </h2>
          <p className={styles.sub}>
            تناژ موردنظر را وارد کنید تا قیمت روز {categoryName} را کارخانه‌به‌کارخانه مقایسه کنید
            و ارزان‌ترین را انتخاب کنید.
          </p>
        </div>
      </header>

      <div className={styles.controls}>
        {/* Locked on a product page: the host passes only that product's own
            sub-category rows, so offering the other sub-categories here would
            switch to a selection that has no rows behind it. Category and
            landing surfaces still get the full selector. */}
        {!defaultSub && (
          <label className={styles.field}>
            <span className={styles.fieldLabel}>زیرشاخه</span>
            <select
              className={styles.select}
              value={sub}
              onChange={(e) => {
                setSub(e.target.value);
                setSize('');
              }}
              aria-label="زیرشاخهٔ محصول"
            >
              <option value="">همه (میانگین)</option>
              {subs.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className={styles.field}>
          <span className={styles.fieldLabel}>{sizeCol}</span>
          <select
            className={styles.select}
            value={size}
            onChange={(e) => setSize(e.target.value)}
            aria-label={`${sizeCol} محصول`}
          >
            <option value="">همهٔ {sizeCol}‌ها (میانگین)</option>
            {sizes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>تناژ سفارش (تن)</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={100000}
            value={tonnage}
            onChange={(e) => {
              const n = Number(e.target.value);
              setTonnage(Number.isFinite(n) && n > 0 ? n : 0);
            }}
            className={styles.input}
            aria-label="تناژ سفارش به تن"
          />
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>شهر مقصد</span>
          <select
            className={styles.select}
            value={city}
            onChange={(e) => setWarehouseCity(e.target.value)}
            aria-label="شهر مقصد تحویل"
          >
            {logisticsConfig.cities.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <div className={styles.presets} role="group" aria-label="تناژهای پیشنهادی">
          {TONNAGE_PRESETS.map((t) => (
            <button
              key={t}
              type="button"
              className={styles.preset}
              aria-pressed={tonnage === t}
              data-active={tonnage === t ? '' : undefined}
              onClick={() => setTonnage(t)}
            >
              {toPersianDigits(t)} تن
            </button>
          ))}
        </div>
      </div>

      {size && (
        <p className={styles.exactNote}>
          مقایسهٔ دقیق: فقط کارخانه‌هایی که «{subs.find((s) => s.slug === sub)?.name ?? categoryName}{' '}
          {sizeCol} {size}» دارند.
        </p>
      )}

      {/* Says what was left out, rather than letting the comparison imply it
          covered every row in the selection. See computeBulkSplit. */}
      {split.excludedNonKg > 0 && (
        <p className={styles.exactNote}>
          {toPersianDigits(split.excludedNonKg)} محصول در این انتخاب قیمتشان بر پایهٔ کیلوگرم نیست
          و در این مقایسه نیامده‌اند؛ برای آن‌ها با کارشناس تماس بگیرید.
        </p>
      )}

      <div className={styles.tableScroll} role="region" aria-label="مقایسهٔ کارخانه‌ها" tabIndex={0}>
        <table className={`${styles.table} tnum`}>
          <caption className="visually-hidden">
            مقایسهٔ کارخانه‌های {categoryName} برای {toPersianDigits(split.tonnage)} تن
          </caption>
          <thead>
            <tr>
              <th scope="col">کارخانه</th>
              <th scope="col" className={styles.num}>قیمت هر کیلوگرم</th>
              <th scope="col" className={styles.num}>اختلاف با ارزان‌ترین</th>
              <th scope="col" className={styles.num}>
                هزینهٔ {toPersianDigits(split.tonnage)} تن
              </th>
            </tr>
          </thead>
          <tbody>
            {split.lines.map((l) => {
              const delta = split.cheapest ? l.pricePerKg - split.cheapest.pricePerKg : 0;
              return (
                <tr key={l.factory} className={l.best ? styles.bestRow : undefined}>
                  <th scope="row" className={styles.factoryCell}>
                    <span className={styles.factoryName}>
                      <FactoryLink categorySlug={category} factory={l.factory} />
                    </span>
                    {l.best ? <span className={styles.bestTag}>ارزان‌ترین</span> : null}
                    <span className={styles.rowCount}>
                      بر اساس {toPersianDigits(l.rowCount)} قیمت
                    </span>
                  </th>
                  <td className={styles.num}>{formatToman(l.pricePerKg, false)}</td>
                  <td className={`${styles.num} ${l.best ? styles.deltaBest : styles.delta}`}>
                    {l.best ? '۰' : `${formatToman(delta, false)}+`}
                  </td>
                  <td className={`${styles.num} ${styles.lineCost}`}>{formatToman(l.lineToman, false)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {split.cheapest ? (
        <p className={styles.suggest}>
          <CheckCircleIcon size={15} aria-hidden="true" />
          <span>
            پیشنهاد: تأمین از کارخانهٔ <strong>{split.cheapest.factory}</strong> با قیمت{' '}
            <strong className="tnum">{formatToman(split.cheapest.pricePerKg, false)}</strong> تومان
            بر کیلوگرم؛ هزینهٔ تقریبی کل{' '}
            <strong className="tnum">{formatToman(split.cheapest.lineToman)}</strong>
            {split.cheapest.rowCount === 1 ? ' (بر اساس فقط یک قیمت ثبت‌شده)' : ''}.
            {savingsVsNext > 0 ? (
              <>
                {' '}
                نسبت به گزینهٔ بعدی حدود{' '}
                <strong className="tnum">{formatToman(savingsVsNext)}</strong> صرفه‌جویی دارد.
              </>
            ) : null}
            {savingsVsMax > savingsVsNext ? (
              <>
                {' '}
                (نسبت به گران‌ترین گزینه، تفاوت تا{' '}
                <strong className="tnum">{formatToman(savingsVsMax)}</strong> تومان است.)
              </>
            ) : null}
          </span>
        </p>
      ) : (
        <p className={styles.suggest}>برای این انتخاب، ردیفی در جدول قیمت نیست؛ زیرشاخه یا {sizeCol} دیگری را امتحان کنید.</p>
      )}

      {landed && split.cheapest ? (
        <div className={styles.landed}>
          <h3 className={styles.landedTitle}>
            قیمت تمام‌شده تا {city}
            <span className={styles.landedOrigin}>ارسال از {logisticsConfig.originLabel}</span>
          </h3>
          <dl className={styles.landedGrid}>
            <div className={styles.landedRow}>
              <dt>کالا ({split.cheapest.factory})</dt>
              <dd className="tnum">{formatToman(split.cheapest.lineToman)}</dd>
            </div>
            <div className={styles.landedRow}>
              <dt>حمل ({toPersianDigits(km)} کیلومتر)</dt>
              <dd className="tnum">{formatToman(landed.freight)}</dd>
            </div>
            <div className={styles.landedRow}>
              <dt>بارگیری و تخلیه</dt>
              <dd className="tnum">{formatToman(landed.handling)}</dd>
            </div>
            <div className={styles.landedRow}>
              <dt>بیمهٔ بار و باسکول</dt>
              <dd className="tnum">{formatToman(landed.insurance + landed.scale)}</dd>
            </div>
            <div className={styles.landedRow}>
              <dt>ارزش افزوده (٪{toPersianDigits(Math.round(vatRate * 100))})</dt>
              <dd className="tnum">{formatToman(landed.vat)}</dd>
            </div>
            <div className={`${styles.landedRow} ${styles.landedTotal}`}>
              <dt>جمع تقریبی</dt>
              <dd className="tnum">{formatToman(landed.total)}</dd>
            </div>
          </dl>
          <p className={styles.landedMeta}>
            زمان تحویل تقریبی: <strong>{landed.delivery}</strong>
          </p>
        </div>
      ) : null}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.cta}
          onClick={() =>
            // Requests live in the profile: sign in first, then file it there.
            requireAuth(() => {
              const best = split.cheapest;
              addRequest({
                type: 'bulk',
                title: `پیش‌فاکتور ${categoryName} عمده، ${toPersianDigits(split.tonnage)} تن`,
                detail: best
                  ? `پیشنهاد سیستم: کارخانهٔ ${best.factory} · ${formatToman(best.pricePerKg, false)} تومان بر کیلوگرم`
                  : undefined,
              });
              toast.success('درخواست پیش‌فاکتور ثبت شد؛ وضعیت آن در پروفایل شماست.');
              router.push(routes.account('requests'));
            })
          }
        >
          دریافت پیش‌فاکتور
        </button>
        <button type="button" className={styles.ghost} onClick={addToInquiry}>
          <PlusIcon size={16} /> افزودن به سبد استعلام
        </button>
      </div>

      <p className={styles.note}>
        قیمت‌ها میانگین نرخ روز هر کارخانه‌اند و تخمینی محسوب می‌شوند؛ نرخ نهایی و موجودی برای این
        تناژ را کارشناس هنگام تماس تأیید می‌کند. پرداخت آنلاین نداریم.
      </p>
    </section>
  );
}

import Link from 'next/link';
import { routes } from '@/lib/routes';
import { getRows } from '@/lib/mock/catalogData';
import { computeBulkSplit } from '@/lib/utils/bulkSplit';
import { formatToman } from '@/lib/utils/format';
import { Reveal } from '@/components/motion/Reveal';
import { ChevronStartIcon } from '@/components/primitives/icons';
import styles from './CompareTeaser.module.css';

/**
 * «مقایسهٔ کارخانه‌ها» teaser — a small taste of the signature capability, not
 * the tool itself. A gunmetal mini-chart shows real per-mill prices for rebar
 * (cheapest in gain-green); the CTA deep-links to the full panel at #compare on
 * the category page. Server component, real catalog data.
 */
export function CompareTeaser() {
  const split = computeBulkSplit(getRows('rebar'), 1);
  const lines = split.lines.slice(0, 4);
  if (lines.length < 2) return null;
  const max = lines[lines.length - 1]!.pricePerKg;

  return (
    <section className={styles.section} aria-labelledby="compare-teaser-title">
      <div className={`container ${styles.grid}`}>
        <Reveal className={styles.copy}>
          <h2 id="compare-teaser-title" className={styles.title}>
            یک محصول، همهٔ کارخانه‌ها
          </h2>
          <p className={styles.sub}>
            قابلیتی که جای دیگری پیدا نمی‌کنید: قیمت روزِ هر کارخانه را کنار هم ببینید، اختلاف را
            بسنجید و با خیال راحت ارزان‌ترین را انتخاب کنید.
          </p>
          <Link href={`${routes.category('rebar')}#compare`} className={styles.cta}>
            مقایسهٔ کارخانه‌های میلگرد
            <ChevronStartIcon size={18} className="icon--rtl" />
          </Link>
        </Reveal>

        <Reveal index={1} className={styles.chartWrap}>
          <div className={`${styles.chart} blueprint`} aria-hidden="true">
            <p className={styles.chartLabel}>میلگرد · قیمت هر کیلوگرم به تومان</p>
            <ul className={styles.bars}>
              {lines.map((l) => (
                <li key={l.factory} className={styles.barRow}>
                  <span className={styles.factory}>{l.factory}</span>
                  <span className={styles.track}>
                    <span
                      className={`${styles.bar} ${l.best ? styles.barBest : ''}`}
                      style={{ inlineSize: `${Math.max(14, Math.round((l.pricePerKg / max) * 100))}%` }}
                    />
                  </span>
                  <span className={`${styles.price} tnum`}>
                    {formatToman(l.pricePerKg, false)}
                  </span>
                </li>
              ))}
            </ul>
            <p className={styles.chartHint}>ارزان‌ترین کارخانه با یک نگاه مشخص است.</p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

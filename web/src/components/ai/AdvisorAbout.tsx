import Link from 'next/link';
import { routes } from '@/lib/routes';
import { AdvisorCapabilities } from './AdvisorCapabilities';
import { ArticleFaq } from '@/components/content/ArticleFaq';
import { ChevronDownIcon } from '@/components/primitives/icons';
import styles from './AdvisorAbout.module.css';

/**
 * Everything that EXPLAINS the advisor, folded away below it.
 *
 * ── The problem this solves ───────────────────────────────────────────────
 * Measured on the page as it shipped: the chat panel was 702px of a 4509px
 * document (16%), with 381px of hero above it and 1143px of capability strip
 * + FAQ below — 1.6× the height of the thing the page is for. On a 1440×900
 * laptop the composer landed at y=922, i.e. BELOW THE FOLD; on a 390×844
 * phone, 207px below it. A visitor arriving at the site's flagship feature
 * could not see its input without scrolling.
 *
 * ── Why a disclosure and not a separate route ─────────────────────────────
 * The obvious fix is to move this copy to /ai/about. It is the wrong one
 * here. This page carries FAQPage JSON-LD, and the prose is the page's whole
 * topical body — the thing that makes it rank for «مشاور هوشمند آهن». Moving
 * it to another URL splits that authority away from the page people actually
 * land on, for a business whose acquisition is organic search.
 *
 * A `<details>` keeps every word in the DOM and in the HTML the crawler
 * receives — Google indexes content behind an accordion normally under
 * mobile-first indexing — while costing the chat nothing, because a collapsed
 * disclosure is one 56px row. Same copy, same JSON-LD, same URL; it simply
 * stops occupying the first screen.
 *
 * `open` is deliberately NOT set on the server: an SSR-open panel would push
 * the chat down on first paint for exactly the visitors this exists to help,
 * and re-create the bug in a different shape.
 */
export function AdvisorAbout({ faqItems }: { faqItems: { question: string; answer: string }[] }) {
  return (
    <details className={styles.about}>
      <summary className={styles.summary}>
        <span className={styles.summaryText}>
          <span className={styles.summaryTitle}>این مشاور دقیقاً چه کار می‌کند؟</span>
          <span className={styles.summaryHint}>
            قیمت‌ها از کجا می‌آیند، وزن‌ها چقدر دقیق‌اند، و چرا پرداخت آنلاینی در کار نیست
          </span>
        </span>
        <ChevronDownIcon size={18} aria-hidden="true" />
      </summary>

      <div className={styles.body}>
        <p className={styles.lede}>
          مشاور آهن‌تایم بر پایهٔ همان قیمت‌هایی جواب می‌دهد که در{' '}
          <Link href={routes.prices()} className={styles.link}>
            جدول‌های سایت
          </Link>{' '}
          می‌بینی؛ هیچ عددی از خودش نمی‌سازد. بگو چه محصولی و برای چه کاری می‌خواهی تا قیمت روز، وزن
          دقیق مقاطع و ارزان‌ترین کارخانه برای تناژت را حساب کند و در پایان، اگر خواستی، پیش‌فاکتور
          هم بگیری.
        </p>
        <AdvisorCapabilities />
        <ArticleFaq items={faqItems} />
      </div>
    </details>
  );
}

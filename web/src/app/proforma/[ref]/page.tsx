import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { buildMetadata } from '@/lib/seo';
import { API_MODE } from '@/lib/api/config';
import { hasDb } from '@/lib/server/db/client';
import { findProformaByRef } from '@/lib/server/repos/leadsRepo';
import { ORG_NAME } from '@/lib/seo';
import { getContact } from '@/lib/server/contact';
import { formatToman, formatJalali, toPersianDigits } from '@/lib/utils/format';
import { PrintButton } from './PrintButton';
import styles from './proforma.module.css';

export const metadata: Metadata = buildMetadata({ title: 'پیش‌فاکتور', noindex: true });

type Params = { params: Promise<{ ref: string }> };

/**
 * Public پیش‌فاکتور view — reachable from the SMS link; the ref is the
 * capability. A proper letterhead (logo + legal contact block) + a
 * print-to-PDF button so the buyer can download a branded PDF.
 */
export default async function ProformaPage({ params }: Params) {
  const { ref } = await params;
  if (API_MODE !== 'live' || !hasDb()) notFound();

  const CONTACT = await getContact();
  const p = await findProformaByRef(decodeURIComponent(ref).toUpperCase());
  if (!p) notFound();

  const expired = p.status === 'expired';

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <PrintButton />
      </div>

      <main className={styles.sheet} dir="rtl">
        {/* ===== Letterhead ===== */}
        <header className={styles.head}>
          <div className={styles.brandBlock}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/ahantime-logo.png" alt={ORG_NAME} className={styles.logo} />
            <div>
              <p className={styles.brand}>{ORG_NAME}</p>
              <p className={styles.tagline}>بازار هوشمند آهن و فولاد — اول مشورت، بعد خرید</p>
              <p className={styles.brandContact}>
                {CONTACT.address}
              </p>
              <p className={`${styles.brandContact} tnum`}>
                تلفن: {CONTACT.phoneLandline} · همراه: {toPersianDigits(CONTACT.phoneMobile)} · ahantime.com
              </p>
            </div>
          </div>
          <div className={styles.meta}>
            <h1 className={styles.title}>پیش‌فاکتور</h1>
            <p className={`${styles.ref} tnum`}>
              <bdi>{p.ref}</bdi>
            </p>
            <p className={styles.date}>تاریخ صدور: {formatJalali(p.createdAt.toISOString())}</p>
          </div>
        </header>

        {expired ? (
          <p className={styles.expired}>
            اعتبار این پیش‌فاکتور به پایان رسیده است. برای قیمت به‌روز با کارشناسان تماس بگیرید.
          </p>
        ) : (
          <p className={styles.validity}>
            اعتبار قیمت‌ها: تا {formatJalali(p.validUntil.toISOString())} ساعت ۱۱:۰۰
          </p>
        )}

        <table className={`${styles.table} tnum`}>
          <caption className="visually-hidden">جدول اقلام پیش‌فاکتور {p.ref}</caption>
          <thead>
            <tr>
              <th scope="col">ردیف</th>
              <th scope="col">شرح کالا</th>
              <th scope="col">مقدار</th>
              <th scope="col">فی (تومان)</th>
              <th scope="col">جمع (تومان)</th>
            </tr>
          </thead>
          <tbody>
            {p.lines.map((line, i) => (
              <tr key={`${line.skuId}-${i}`}>
                <td>{toPersianDigits(i + 1)}</td>
                <td className={styles.name}>{line.name}</td>
                <td>
                  {toPersianDigits(line.qty)}{' '}
                  {line.unit === 'kg' ? 'کیلوگرم' : line.unit === 'branch' ? 'شاخه' : line.unit === 'sheet' ? 'برگ' : 'متر'}
                </td>
                <td>{line.unitPrice ? formatToman(line.unitPrice, false) : 'توافقی'}</td>
                <td>{line.lineTotal ? formatToman(line.lineTotal, false) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className={`${styles.totals} tnum`}>
          <div>
            <dt>جمع کل</dt>
            <dd>{formatToman(p.subtotal, false)} تومان</dd>
          </div>
          <div>
            <dt>ارزش افزوده ({toPersianDigits(Math.round(p.vatRate * 100))}٪)</dt>
            <dd>{formatToman(p.vatAmount, false)} تومان</dd>
          </div>
          <div className={styles.grand}>
            <dt>مبلغ قابل پرداخت</dt>
            <dd>{formatToman(p.total, false)} تومان</dd>
          </div>
        </dl>

        <footer className={styles.foot}>
          <p>
            این پیش‌فاکتور جهت استعلام است و فاکتور رسمی محسوب نمی‌شود. پرداخت آنلاین نداریم — تسویه پس از
            هماهنگی با کارشناس فروش انجام می‌شود.
          </p>
          <p className="tnum">
            {ORG_NAME} · {CONTACT.phoneLandline} · ahantime.com
          </p>
        </footer>
      </main>
    </div>
  );
}

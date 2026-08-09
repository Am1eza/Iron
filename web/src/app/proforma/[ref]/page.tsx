import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { buildMetadata } from '@/lib/seo';
import { API_MODE } from '@/lib/api/config';
import { hasDb } from '@/lib/server/db/client';
import { findProformaByRef, findLead } from '@/lib/server/repos/leadsRepo';
import { ORG_NAME } from '@/lib/seo';
import { getContact } from '@/lib/server/contact';
import { getSession } from '@/lib/auth/session';
import { clubStatus, getLetterhead } from '@/lib/server/repos/clubRepo';
import { isLetterheadUsable } from '@/lib/utils/letterhead';
import { formatToman, toPersianDigits } from '@/lib/utils/format';
import { formatJalali } from '@/lib/utils/jalali';
import { ProformaSheet, type CustomLetterhead } from './ProformaSheet';
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

  // Own-letterhead eligibility (US-tender-letterhead): signed in, actually
  // owns the lead this proforma belongs to (not just anyone who has the
  // link — the ref is a public capability, but the letterhead swap is a
  // per-customer perk), پولادی tier, and has filled in a usable letterhead.
  // Any failure at any step just means `custom` stays null and the page
  // renders exactly as it always has.
  let custom: CustomLetterhead | null = null;
  const session = await getSession();
  if (session) {
    const lead = await findLead(p.leadId);
    if (lead?.userId === session.id) {
      const [status, letterhead] = await Promise.all([
        clubStatus(session.id),
        getLetterhead(session.id),
      ]);
      if (status.tier === 'poolad' && isLetterheadUsable(letterhead)) {
        custom = {
          logoUrl: letterhead!.logoUrl!,
          companyName: letterhead!.companyName!,
          address: letterhead!.address,
          phone: letterhead!.phone,
        };
      }
    }
  }

  const expired = p.status === 'expired';

  return (
    <ProformaSheet
      orgName={ORG_NAME}
      tagline="بازار هوشمند آهن و فولاد: اول مشورت، بعد خرید"
      address={CONTACT.address}
      phoneLandline={CONTACT.phoneLandline}
      phoneMobile={CONTACT.phoneMobile}
      refCode={p.ref}
      date={formatJalali(p.createdAt.toISOString())}
      custom={custom}
    >
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
                {line.unit === 'kg'
                  ? 'کیلوگرم'
                  : line.unit === 'branch'
                    ? 'شاخه'
                    : line.unit === 'sheet'
                      ? 'برگ'
                      : 'متر'}
              </td>
              <td>{line.unitPrice ? formatToman(line.unitPrice, false) : 'توافقی'}</td>
              <td>{line.lineTotal ? formatToman(line.lineTotal, false) : 'توافقی'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className={`${styles.totals} tnum`}>
        <div>
          <dt>جمع کل</dt>
          <dd>{formatToman(p.subtotal, false)} تومان</dd>
        </div>
        {/* Discount is applied BEFORE VAT (see issueProforma in leads.service.ts),
              so hiding it made the three printed numbers fail to reconcile and the
              VAT percentage read as wrong against the printed base. Both rows are
              omitted at zero discount so the common case is unchanged. */}
        {p.discountToman > 0 ? (
          <>
            <div>
              <dt>تخفیف</dt>
              <dd>−{formatToman(p.discountToman, false)} تومان</dd>
            </div>
            <div>
              <dt>مبلغ مشمول مالیات</dt>
              <dd>{formatToman(p.subtotal - p.discountToman, false)} تومان</dd>
            </div>
          </>
        ) : null}
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
          این پیش‌فاکتور جهت استعلام است و فاکتور رسمی محسوب نمی‌شود. پرداخت آنلاین نداریم؛ تسویه
          پس از هماهنگی با کارشناس فروش انجام می‌شود.
        </p>
        <p className="tnum">
          {ORG_NAME} · {CONTACT.phoneLandline} · ahantime.com
        </p>
      </footer>
    </ProformaSheet>
  );
}

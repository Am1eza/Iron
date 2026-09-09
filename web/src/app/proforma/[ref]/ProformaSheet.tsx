'use client';
/**
 * The پیش‌فاکتور's toolbar + printed sheet — a client component ONLY
 * because a پولادی customer viewing their own proforma can toggle between
 * our brand block and their own (US-tender-letterhead), and that toggle
 * (in the toolbar) and the brand block it controls (inside the sheet) are
 * DOM siblings/cousins, not nested — so one component has to own both to
 * share state.
 *
 * Owns the whole document body (table/totals/footer) too, not just the
 * toolbar+header: this is the actual quote document sent to customers (the
 * "Capture" step of the funnel, CLAUDE.md §1), so unlike the fa-only
 * SSR-shell exception used elsewhere (breadcrumbs, page `<title>`), the
 * document itself has to localize — `page.tsx` only fetches data and stays
 * a Server Component; every visible string here is translated. `line.name`
 * is the one exception: it's a frozen point-in-time snapshot on the
 * proforma row (not a live SKU reference — the category it belonged to may
 * have since changed or been removed), so there's no live category/
 * sub-category entity to run through `getLocalizedSkuName` without
 * re-deriving a name the document never actually quoted. `PRICE_UNIT_LABEL`
 * (catalogLabels.ts) and Jalali dates stay fa too, matching every other
 * translated surface in this app that reuses them.
 */
import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { formatToman, localizeDigits } from '@/lib/utils/format';
import { PRICE_UNIT_LABEL } from '@/lib/utils/catalogLabels';
import type { LineItem } from '@/lib/types/domain';
import type { AppLocale } from '@/i18n/config';
import { PrintButton } from './PrintButton';
import styles from './proforma.module.css';

export interface CustomLetterhead {
  logoUrl: string;
  companyName: string;
  address: string | null;
  phone: string | null;
}

export type ProformaStatus = 'active' | 'expired' | 'cancelled';

export function ProformaSheet({
  orgName,
  address,
  phoneLandline,
  phoneMobile,
  refCode,
  date,
  customerName,
  customerMobile,
  custom,
  status,
  validUntilText,
  lines,
  subtotal,
  volumeDiscountToman,
  volumeDiscountLabel,
  discountToman,
  vatRatePct,
  vatAmount,
  total,
}: {
  orgName: string;
  address: string;
  phoneLandline: string;
  phoneMobile: string;
  refCode: string;
  /** Pre-formatted Jalali string (`formatJalali`) — dates stay fa/Jalali in
   *  every locale across this app, this document included. */
  date: string;
  /** From `leads.contact_name` — optional at intake, so this is genuinely
   *  nullable, unlike `customerMobile`. */
  customerName: string | null;
  /** From `leads.contact_mobile` — required at intake, so every real
   *  پیش‌فاکتور has one. Typed nullable anyway (not `!`) because a lead can
   *  in principle be deleted out from under an already-issued proforma; the
   *  render below already treats a missing block as "omit it", not a crash. */
  customerMobile: string | null;
  /** Present only when the viewer is signed in, owns this lead, is پولادی
   *  tier, and has a usable letterhead saved — see the page's eligibility
   *  check. Its mere presence, not a tier check here, gates the toggle. */
  custom: CustomLetterhead | null;
  status: ProformaStatus;
  /** Pre-formatted Jalali string for the validity deadline (fa/Jalali in
   *  every locale, same as `date`). */
  validUntilText: string;
  lines: LineItem[];
  subtotal: number;
  volumeDiscountToman: number;
  volumeDiscountLabel: string | null;
  discountToman: number;
  vatRatePct: number;
  vatAmount: number;
  total: number;
}) {
  const t = useTranslations('proforma');
  const tCommon = useTranslations('common');
  const locale = useLocale() as AppLocale;
  // Default OFF: printing our own brand is the behavior every existing link
  // already has, so an eligible customer opts IN rather than the letterhead
  // silently changing under them.
  const [useCustom, setUseCustom] = useState(false);

  const invalidMessage =
    status === 'cancelled' ? t('cancelledMessage') : status === 'expired' ? t('expiredMessage') : null;

  const money = (value: number) => `${formatToman(value, false, locale)} ${tCommon('unit.currency')}`;

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        {custom ? (
          <div className={styles.letterheadToggle} role="group" aria-label={t('letterheadToggleAriaLabel')}>
            <button
              type="button"
              className={styles.toggleBtn}
              data-active={!useCustom ? '' : undefined}
              aria-pressed={!useCustom}
              onClick={() => setUseCustom(false)}
            >
              {t('ourLetterheadTab', { brand: tCommon('brand') })}
            </button>
            <button
              type="button"
              className={styles.toggleBtn}
              data-active={useCustom ? '' : undefined}
              aria-pressed={useCustom}
              onClick={() => setUseCustom(true)}
            >
              {t('myCompanyLetterheadTab')}
            </button>
          </div>
        ) : null}
        <PrintButton />
      </div>

      <main className={styles.sheet} dir={locale === 'ar' || locale === 'fa' ? 'rtl' : 'ltr'}>
        <header className={styles.head}>
          {useCustom && custom ? (
            <div className={styles.brandBlock}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={custom.logoUrl} alt={custom.companyName} className={styles.logo} />
              <div>
                <p className={styles.brand}>{custom.companyName}</p>
                {custom.address ? <p className={styles.brandContact}>{custom.address}</p> : null}
                {custom.phone ? (
                  <p className={`${styles.brandContact} tnum`}>
                    {t('phonePrefix')} {localizeDigits(custom.phone, locale)}
                  </p>
                ) : null}
              </div>
            </div>
          ) : (
            <div className={styles.brandBlock}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/ahantime-logo.png" alt={orgName} className={styles.logo} />
              <div>
                <p className={styles.brand}>{orgName}</p>
                <p className={styles.tagline}>{t('tagline')}</p>
                <p className={styles.brandContact}>{address}</p>
                <p className={`${styles.brandContact} tnum`}>
                  {t('phonePrefix')} {phoneLandline} · {t('mobilePrefix')}{' '}
                  {localizeDigits(phoneMobile, locale)} · ahantime.com
                </p>
              </div>
            </div>
          )}
          <div className={styles.meta}>
            <h1 className={styles.title}>{t('title')}</h1>
            <p className={`${styles.ref} tnum`}>
              <bdi>{refCode}</bdi>
            </p>
            <p className={styles.date}>
              {t('issuedDatePrefix')} {date}
            </p>
          </div>
        </header>

        {/* A پیش‌فاکتور has to say who it was issued to — omitted entirely
            (not a placeholder) when a lead was deleted out from under an
            already-issued document, rather than printing a placeholder for a
            person the sheet can no longer name. `customerMobile` is required
            at lead intake, so in the overwhelmingly common case this always
            renders; `customerName` is optional there and simply does not
            print its own line when absent. */}
        {customerName || customerMobile ? (
          <div className={styles.customer}>
            <span className={styles.customerLabel}>{t('customerLabel')}</span>
            {customerName ? <span className={styles.customerName}>{customerName}</span> : null}
            {customerMobile ? (
              <span className={`${styles.customerPhone} tnum`}>{localizeDigits(customerMobile, locale)}</span>
            ) : null}
          </div>
        ) : null}

        {invalidMessage ? (
          <p className={styles.expired}>{invalidMessage}</p>
        ) : (
          <p className={styles.validity}>
            {t('validityPrefix')} {validUntilText}
          </p>
        )}

        <table className={`${styles.table} tnum`}>
          <caption className="visually-hidden">{t('tableCaption', { ref: refCode })}</caption>
          <thead>
            <tr>
              <th scope="col">{t('col.row')}</th>
              <th scope="col">{t('col.description')}</th>
              <th scope="col">{t('col.qty')}</th>
              <th scope="col">{t('col.unitPrice')}</th>
              <th scope="col">{t('col.lineTotal')}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => (
              <tr key={`${line.skuId}-${i}`}>
                <td>{localizeDigits(i + 1, locale)}</td>
                <td className={styles.name}>{line.name}</td>
                <td>
                  {localizeDigits(line.qty, locale)} {PRICE_UNIT_LABEL[line.unit] ?? line.unit}
                </td>
                <td>{line.unitPrice ? formatToman(line.unitPrice, false, locale) : t('negotiable')}</td>
                <td>{line.lineTotal ? formatToman(line.lineTotal, false, locale) : t('negotiable')}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className={`${styles.totals} tnum`}>
          <div>
            <dt>{t('subtotalLabel')}</dt>
            <dd>{money(subtotal)}</dd>
          </div>
          {/* Discounts are applied BEFORE VAT (see issueProforma in
                leads.service.ts), so hiding them made the printed numbers fail to
                reconcile and the VAT percentage read as wrong against the printed
                base. Each row is omitted when its own amount is zero, so a plain
                quote prints exactly as it always has.

                The تخفیف پلکانی row is deliberately its OWN line naming its own
                reason and percentage, not folded into the unit price or into the
                rep's «تخفیف» line: a buyer must be able to see that the volume
                band was applied and at what rate, or the promise on the site is
                unverifiable from the document it is supposed to appear on. */}
          {volumeDiscountToman > 0 ? (
            <div>
              <dt>{volumeDiscountLabel ?? t('volumeDiscountLabel')}</dt>
              <dd>−{money(volumeDiscountToman)}</dd>
            </div>
          ) : null}
          {discountToman > 0 ? (
            <div>
              <dt>{t('discountLabel')}</dt>
              <dd>−{money(discountToman)}</dd>
            </div>
          ) : null}
          {discountToman + volumeDiscountToman > 0 ? (
            <div>
              <dt>{t('taxableAmountLabel')}</dt>
              <dd>{money(subtotal - discountToman - volumeDiscountToman)}</dd>
            </div>
          ) : null}
          <div>
            <dt>{t('vatLabel', { pct: localizeDigits(vatRatePct, locale) })}</dt>
            <dd>{money(vatAmount)}</dd>
          </div>
          <div className={styles.grand}>
            <dt>{t('grandTotalLabel')}</dt>
            <dd>{money(total)}</dd>
          </div>
        </dl>

        <footer className={styles.foot}>
          <p>{t('footerDisclaimer')}</p>
          <p className="tnum">
            {orgName} · {phoneLandline} · ahantime.com
          </p>
        </footer>
      </main>
    </div>
  );
}

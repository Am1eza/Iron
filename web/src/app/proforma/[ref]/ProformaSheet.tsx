'use client';
/**
 * The پیش‌فاکتور's toolbar + printed sheet shell — a client component ONLY
 * because a پولادی customer viewing their own proforma can toggle between
 * our brand block and their own (US-tender-letterhead), and that toggle
 * (in the toolbar) and the brand block it controls (inside the sheet) are
 * DOM siblings/cousins, not nested — so one component has to own both to
 * share state. Everything else on the sheet (table/totals/footer) stays a
 * server component, passed in as `children`, exactly as before.
 */
import { useState, type ReactNode } from 'react';
import { toPersianDigits } from '@/lib/utils/format';
import { PrintButton } from './PrintButton';
import styles from './proforma.module.css';

export interface CustomLetterhead {
  logoUrl: string;
  companyName: string;
  address: string | null;
  phone: string | null;
}

export function ProformaSheet({
  orgName,
  tagline,
  address,
  phoneLandline,
  phoneMobile,
  refCode,
  date,
  custom,
  children,
}: {
  orgName: string;
  tagline: string;
  address: string;
  phoneLandline: string;
  phoneMobile: string;
  refCode: string;
  date: string;
  /** Present only when the viewer is signed in, owns this lead, is پولادی
   *  tier, and has a usable letterhead saved — see the page's eligibility
   *  check. Its mere presence, not a tier check here, gates the toggle. */
  custom: CustomLetterhead | null;
  children: ReactNode;
}) {
  // Default OFF: printing our own brand is the behavior every existing link
  // already has, so an eligible customer opts IN rather than the letterhead
  // silently changing under them.
  const [useCustom, setUseCustom] = useState(false);

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        {custom ? (
          <div className={styles.letterheadToggle} role="group" aria-label="انتخاب سربرگ">
            <button
              type="button"
              className={styles.toggleBtn}
              data-active={!useCustom ? '' : undefined}
              aria-pressed={!useCustom}
              onClick={() => setUseCustom(false)}
            >
              سربرگ آهن‌تایم
            </button>
            <button
              type="button"
              className={styles.toggleBtn}
              data-active={useCustom ? '' : undefined}
              aria-pressed={useCustom}
              onClick={() => setUseCustom(true)}
            >
              سربرگ شرکت من
            </button>
          </div>
        ) : null}
        <PrintButton />
      </div>

      <main className={styles.sheet} dir="rtl">
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
                    تلفن: {toPersianDigits(custom.phone)}
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
                <p className={styles.tagline}>{tagline}</p>
                <p className={styles.brandContact}>{address}</p>
                <p className={`${styles.brandContact} tnum`}>
                  تلفن: {phoneLandline} · همراه: {toPersianDigits(phoneMobile)} · ahantime.com
                </p>
              </div>
            </div>
          )}
          <div className={styles.meta}>
            <h1 className={styles.title}>پیش‌فاکتور</h1>
            <p className={`${styles.ref} tnum`}>
              <bdi>{refCode}</bdi>
            </p>
            <p className={styles.date}>تاریخ صدور: {date}</p>
          </div>
        </header>

        {children}
      </main>
    </div>
  );
}

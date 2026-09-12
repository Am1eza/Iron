'use client';
import { useEffect, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { routes } from '@/lib/routes';
import { useCartStore } from '@/lib/stores/cart';
import { useRequestsStore } from '@/lib/stores/requests';
import { useAuthStore } from '@/lib/stores/auth';
import { useToast } from '@/lib/hooks/useToast';
import { api } from '@/lib/api';
import { API_MODE } from '@/lib/api/config';
import { ApiError } from '@/lib/api/errors';
import { trackGoal } from '@/lib/analytics/track';
import type { CreateLeadResult } from '@/lib/server/services/leads.service';
import { formatToman, localizeDigits } from '@/lib/utils/format';
import type { AppLocale } from '@/i18n/config';
import { Textarea } from '@/components/forms/fields';
import { Button, EmptyState } from '@/components/ui';
import { CheckCircleIcon, DownloadIcon } from '@/components/primitives/icons';
import styles from './RequestFlow.module.css';

/**
 * The signed-in request flow — review the inquiry basket, add an optional note,
 * submit. On success the user gets an explicit confirmation that the request
 * reached the SALES TEAM, plus (when priced) a one-tap link to download the
 * branded پیش‌فاکتور PDF. The lead lands on the sales panel immediately.
 */
export function RequestFlow() {
  const t = useTranslations('requestFlow');
  const tAction = useTranslations('common.action');
  const tUnit = useTranslations('common.unit');
  const locale = useLocale() as AppLocale;
  const money = (v: number) => `${formatToman(v, false, locale)} ${tUnit('currency')}`;
  const toast = useToast();
  const items = useCartStore((s) => s.items);
  const clear = useCartStore((s) => s.clear);
  const addRequest = useRequestsStore((s) => s.add);
  const user = useAuthStore((s) => s.user);
  const authStatus = useAuthStore((s) => s.status);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<CreateLeadResult | null>(null);

  useEffect(() => {
    if (authStatus === 'anonymous') trackGoal('funnel', 'auth_gate_view', 'request');
  }, [authStatus]);

  // ===== success confirmation =====
  if (done) {
    return (
      <div className={styles.success} role="status">
        <span className={styles.successIcon} aria-hidden="true">
          <CheckCircleIcon size={40} />
        </span>
        <h2 className={styles.successTitle}>{t('successTitle')}</h2>
        <p className={styles.successLead}>
          {done.proformaRef ? t('successLeadPriced') : t('successLeadUnpriced')}
        </p>
        <p className={`${styles.successRef} tnum`}>
          {t('trackingCode')} <bdi>{done.ref}</bdi>
        </p>
        {done.proformaRef ? (
          <div className={styles.successProforma}>
            {done.priceChanged ? (
              <p className={styles.successNote} role="alert">
                {t('priceUpdatedNote')}
              </p>
            ) : null}
            <p className="tnum">
              {done.total
                ? t('proformaIssuedWithTotal', { total: money(done.total) })
                : t('proformaIssued')}
            </p>
            <Link
              href={`/proforma/${encodeURIComponent(done.proformaRef)}`}
              className={styles.pdfBtn}
              target="_blank"
              rel="noreferrer"
            >
              <DownloadIcon size={18} aria-hidden="true" />
              {t('downloadProforma')}
            </Link>
          </div>
        ) : (
          <p className={styles.successNote}>{t('someItemsNeedQuote')}</p>
        )}
        <div className={styles.successActions}>
          <Link href={routes.account('requests')} className={styles.trackLink}>
            {t('trackMyRequests')}
          </Link>
          <Link href={routes.prices()} className={styles.editLink}>
            {t('continueShopping')}
          </Link>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        size="section"
        headline={t('emptyHeadline')}
        body={t('emptyBody')}
        primary={{ label: tAction('viewPrices'), href: routes.prices() }}
      />
    );
  }

  const submit = async () => {
    const title =
      items.length === 1
        ? t('proformaTitleSingle', { name: items[0]!.name })
        : t('proformaTitleMulti', { count: items.length });
    const detail = items.map((i) => `${i.name} × ${localizeDigits(i.qty, locale)}`).join(' · ');

    // Never fall through to the local-only store while signed in: that path
    // writes to browser storage ONLY and the sales team never sees the lead,
    // yet the UI used to claim the request was filed. It is reachable in the
    // mock API mode alone, and only for a visitor we know is anonymous — the
    // real submit button is not rendered for them at all (see below).
    if (API_MODE === 'live') {
      if (!user) {
        toast.error(t('loginRequiredError'));
        return;
      }
      setBusy(true);
      try {
        const result = await api.leads.create({
          contact: { name: user.name, mobile: user.mobile },
          items: items.map((i) => ({ skuId: i.skuId, qty: i.qty, unit: i.unit, quotedUnitPrice: i.unitPrice })),
          channel: 'sms',
          source: 'cart',
          note: note.trim() || undefined,
        });
        clear();
        // Conversion: this is the moment a visitor became a real sales lead.
        trackGoal('lead', 'cart-proforma', `${items.length} items`);
        setDone(result);
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : t('submitFailedError'));
      } finally {
        setBusy(false);
      }
      return;
    }

    // Mock API mode (local development only — production is always live).
    addRequest({ type: 'proforma', title, detail, note: note.trim() || undefined });
    clear();
    toast.success(t('submitSuccessToast'));
  };

  return (
    <div className={styles.flow}>
      <ul className={styles.items}>
        {items.map((i) => (
          <li key={i.skuId} className={styles.item}>
            <span className={styles.itemName}>{i.name}</span>
            <span className={`${styles.itemMeta} tnum`}>
              {localizeDigits(i.qty, locale)} {i.unit === 'kg' ? t('unitKg') : t('unitPiece')}
              {i.unitPrice ? ` · ${money(i.unitPrice)}` : ''}
            </span>
          </li>
        ))}
      </ul>

      <Textarea
        label={t('notesLabel')}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t('notesPlaceholder')}
        rows={3}
      />

      <div className={styles.actions}>
        {authStatus === 'anonymous' ? (
          // Same pattern as the advisor's پیش‌فاکتور card: a visitor we know is
          // signed out gets the login CTA, not a submit button that would file
          // nothing. The cart survives the round trip, so they come straight back.
          <Link href={routes.login(routes.request())} className={styles.loginBtn}>
            {t('loginCta')}
          </Link>
        ) : (
          <Button onClick={submit} disabled={busy || authStatus === 'loading'} loading={busy}>
            {busy ? t('submitting') : t('submitCta')}
          </Button>
        )}
        <Link href={routes.cart()} className={styles.editLink}>
          {t('editCart')}
        </Link>
      </div>

      {authStatus === 'anonymous' && <p className={styles.note}>{t('anonymousNote')}</p>}

      <p className={styles.note}>{t('footerNote')}</p>
    </div>
  );
}

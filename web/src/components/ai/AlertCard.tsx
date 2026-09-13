'use client';
import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { routes } from '@/lib/routes';
import { api, isApiError } from '@/lib/api';
import { formatToman } from '@/lib/utils/format';
import { CheckCircleIcon, BellIcon } from '@/components/primitives/icons';
import { useAuthStore } from '@/lib/stores/auth';
import styles from './ProformaCard.module.css';

/**
 * The advisor's «هشدار قیمت» confirmation card (J-223).
 *
 * `setPriceAlert` used to write the alert row itself — the one model tool in
 * this codebase that produced a real side effect (future SMS to this person)
 * straight from a question, with no human step. It now only prepares a
 * draft; this card is where the visitor actually arms it, and
 * `POST /api/ai/alert/confirm` is the only writer.
 *
 * `confirmedAt` lives ON the message, exactly like `LeadDraftView`'s
 * `confirmedRef`: a restored thread comes back confirmed rather than
 * offering the button a second time for an alert that already exists.
 *
 * Shares `ProformaCard.module.css` deliberately — this is the same card in
 * the same thread, and a second stylesheet would be two things to keep in
 * visual sync for no gain.
 */
export type AlertDraftView = {
  draftId: string;
  product: string;
  op: 'below' | 'above';
  threshold: number;
  currentPrice?: number;
  unitLabel?: string;
  /** Set once this visitor confirmed it — the card then states the fact
   *  instead of offering the action again. */
  confirmedAt?: string;
  /** Already-active duplicate rather than a new row (the repo merges). */
  merged?: boolean;
};

export function AlertCard({
  draft,
  onConfirmed,
}: {
  draft: AlertDraftView;
  onConfirmed: (patch: Partial<AlertDraftView>) => void;
}) {
  const t = useTranslations('ai.alertCard');
  const authStatus = useAuthStore((s) => s.status);
  // `loading` is deliberately NOT treated as signed-in here (unlike the
  // proforma card, which has a server-sent `signedIn` hint to fall back on):
  // showing the login link for a moment and then the button is honest, while
  // the reverse would offer a confirm that 401s.
  const signedIn = authStatus === 'authenticated';
  const authPending = authStatus === 'loading';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.ai.confirmAlert(draft.draftId);
      onConfirmed({ confirmedAt: new Date().toISOString(), merged: result.merged });
    } catch (e) {
      setError(isApiError(e) ? e.message : t('confirmFailed'));
    } finally {
      setBusy(false);
    }
  };

  const threshold = `${formatToman(draft.threshold)}${draft.unitLabel ? ` (${draft.unitLabel})` : ''}`;

  if (draft.confirmedAt) {
    return (
      <div className={styles.card} role="status">
        <div className={styles.done}>
          <CheckCircleIcon size={16} aria-hidden="true" />
          <span>{draft.merged ? t('alreadyActive') : t('confirmed')}</span>
        </div>
        <p className={styles.note}>{t('confirmedNote', { product: draft.product, threshold })}</p>
        <div className={styles.actions}>
          <Link href={routes.account('alerts')} className={styles.ghost}>
            {t('manageAlerts')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <span className={styles.badge}>
          <BellIcon size={14} aria-hidden="true" /> {t('badge')}
        </span>
      </div>

      <p className={styles.note}>
        {draft.op === 'below'
          ? t('summaryBelow', { product: draft.product, threshold })
          : t('summaryAbove', { product: draft.product, threshold })}
      </p>

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.actions}>
        {signedIn ? (
          <button
            type="button"
            className={styles.cta}
            onClick={() => void confirm()}
            disabled={busy || authPending}
          >
            {busy ? t('confirming') : t('confirmCta')}
          </button>
        ) : (
          <Link href={routes.login(routes.ai())} className={styles.cta}>
            {t('loginCta')}
          </Link>
        )}
      </div>

      <p className={styles.note}>{t('pendingNote')}</p>
    </div>
  );
}

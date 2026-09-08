'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import styles from './ClubPanel.module.css';

/** Shareable invite code with copy-to-clipboard — the referral hook. A friend
 *  who signs up with this code and verifies their identity earns the owner
 *  club points (see clubRepo qualifiedReferralCount). */
export function InviteCode({ code }: { code: string }) {
  const t = useTranslations('account.invite');
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the code is visible to copy manually */
    }
  };
  return (
    <section className={styles.invite} aria-label={t('ariaLabel')}>
      <div>
        <span className={styles.inviteLabel}>{t('label')}</span>
        <p className={styles.inviteHint}>{t('hint')}</p>
      </div>
      <button type="button" className={styles.inviteCode} onClick={copy} aria-live="polite">
        <span className={styles.inviteValue}>{code}</span>
        <span className={styles.inviteCopy}>{copied ? t('copied') : t('copy')}</span>
      </button>
    </section>
  );
}

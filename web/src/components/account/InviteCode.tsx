'use client';
import { useState } from 'react';
import styles from './ClubPanel.module.css';

/** Shareable invite code with copy-to-clipboard — the referral hook. A friend
 *  who signs up with this code and verifies their identity earns the owner
 *  club points (see clubRepo qualifiedReferralCount). */
export function InviteCode({ code }: { code: string }) {
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
    <section className={styles.invite} aria-label="کد دعوت شما">
      <div>
        <span className={styles.inviteLabel}>کد دعوت شما</span>
        <p className={styles.inviteHint}>دوستانتان را دعوت کنید؛ با ثبت‌نام و احراز هویت آن‌ها، امتیاز می‌گیرید.</p>
      </div>
      <button type="button" className={styles.inviteCode} onClick={copy} aria-live="polite">
        <span className={styles.inviteValue}>{code}</span>
        <span className={styles.inviteCopy}>{copied ? 'کپی شد ✓' : 'کپی'}</span>
      </button>
    </section>
  );
}

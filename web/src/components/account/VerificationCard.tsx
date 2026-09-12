'use client';
import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { http } from '@/lib/api/http';
import { toPersianDigits } from '@/lib/utils/format';
import { useToast } from '@/lib/hooks/useToast';
import { ApiError } from '@/lib/api/errors';
import { Badge } from '@/components/ui';
import { TextInput } from '@/components/forms/fields';
import { Button } from '@/components/primitives/Button';
import { CheckCircleIcon, ShieldIcon } from '@/components/primitives/icons';
import { BusinessAccountBadge } from './BusinessAccountBadge';
import styles from './VerificationCard.module.css';

type VStatus = 'none' | 'pending' | 'approved' | 'rejected';

/** `LEVEL_INFO` (lib/data/verification.ts) stays the fa-only source of truth
 *  (also read server-side and by the lead view, out of scope) — translated
 *  locally here via flat `account.verification` keys keyed by level. */
const LEVEL_UNLOCK_COUNT: Record<1 | 2 | 3, number> = { 1: 3, 2: 4, 3: 4 };

/**
 * Progressive identity verification — the "why verify" surface. Shows the
 * user's current level, what they've unlocked, and what the NEXT level unlocks
 * (the motivation), with a self-attest form. Submitting flags the info pending;
 * an admin approves it (verificationRepo). No external API call.
 */
export function VerificationCard({
  level,
  idStatus,
  bizStatus,
  verifiedCompanyName,
}: {
  level: 1 | 2 | 3;
  idStatus: VStatus;
  bizStatus: VStatus;
  /** The APPROVED company's name — shown inside the level-3 badge. Distinct
   *  from the `companyName` form field below, which is what the user is
   *  currently typing into a level-3 submission. */
  verifiedCompanyName?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const t = useTranslations('account.verification');
  const [nationalId, setNationalId] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyNationalId, setCompanyNationalId] = useState('');
  const [economicCode, setEconomicCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const levelUnlocks = (lvl: 1 | 2 | 3) =>
    Array.from({ length: LEVEL_UNLOCK_COUNT[lvl] }, (_, i) =>
      lvl === 3
        ? t(`level3Unlock${i + 1}`, { label: t('businessAccountLabel') })
        : t(`level${lvl}Unlock${i + 1}`),
    );

  const submit = async (body: Record<string, unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      await http.post('/api/me/verification', body);
      toast.success(t('submitSuccess'));
      router.refresh();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t('submitError'));
    } finally {
      setBusy(false);
    }
  };

  const nextLevel = level < 3 ? ((level + 1) as 2 | 3) : null;
  const nextStatus = level === 1 ? idStatus : bizStatus;

  return (
    <section className={styles.card} aria-labelledby="verify-heading">
      <div className={styles.head}>
        <span className={styles.shield} aria-hidden="true">
          <ShieldIcon size={22} />
        </span>
        <div>
          <h3 id="verify-heading" className={styles.title}>
            {t('title')}
          </h3>
          <p className={styles.currentLevel}>
            {t('currentLevelPrefix')}{' '}
            <Badge tone="success">{t('levelBadge', { level: toPersianDigits(level), name: t(`levelName.${level}`) })}</Badge>
          </p>
        </div>
      </div>

      {/* what's already unlocked */}
      <ul className={styles.unlocked}>
        {levelUnlocks(level).map((u) => (
          <li key={u}>
            <CheckCircleIcon size={15} aria-hidden="true" className={styles.unlockedIcon} />
            <span>{u}</span>
          </li>
        ))}
      </ul>

      {nextLevel ? (
        <div className={styles.next}>
          <div className={styles.nextHead}>
            <span className={styles.nextTitle}>
              {t('nextLevelIntro', { level: toPersianDigits(nextLevel), name: t(`levelName.${nextLevel}`) })}
            </span>
          </div>
          <ul className={styles.nextPerks}>
            {levelUnlocks(nextLevel).map((u) => (
              <li key={u}>{u}</li>
            ))}
          </ul>

          {nextStatus === 'pending' ? (
            <p className={styles.pending}>
              <Badge tone="stale">{t('pendingBadge')}</Badge> {t('pendingNote')}
            </p>
          ) : (
            /* Progressive disclosure: the multi-field form only opens when the
               user actually decides to upgrade — it used to sit fully expanded
               and dominate the profile page. Rejected → open by default so the
               fix-and-resubmit path is one step, not two. */
            <details className={styles.formDisclosure} open={nextStatus === 'rejected'}>
            <summary className={styles.formSummary}>
              {t('completeLevel', { level: toPersianDigits(nextLevel) })}
            </summary>
            <form
              className={styles.form}
              onSubmit={(e) => {
                e.preventDefault();
                if (busy) return;
                if (nextLevel === 2) submit({ level: 2, nationalId });
                else submit({ level: 3, companyName, companyNationalId, economicCode });
              }}
            >
              {nextStatus === 'rejected' ? <p className={styles.rejected}>{t('rejectedNotice')}</p> : null}
              {nextLevel === 2 ? (
                <TextInput
                  label={t('nationalIdLabel')}
                  inputMode="numeric"
                  dir="ltr"
                  maxLength={10}
                  value={nationalId}
                  onChange={(e) => setNationalId(e.target.value)}
                />
              ) : (
                <>
                  <TextInput
                    label={t('companyNameLabel')}
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                  />
                  <TextInput
                    label={t('companyNationalIdLabel')}
                    inputMode="numeric"
                    dir="ltr"
                    maxLength={11}
                    value={companyNationalId}
                    onChange={(e) => setCompanyNationalId(e.target.value)}
                  />
                  <TextInput
                    label={t('economicCodeLabel')}
                    inputMode="numeric"
                    dir="ltr"
                    maxLength={12}
                    value={economicCode}
                    onChange={(e) => setEconomicCode(e.target.value)}
                  />
                </>
              )}
              {err ? <p className={styles.error}>{err}</p> : null}
              <Button type="submit" loading={busy}>
                {t('submit')}
              </Button>
            </form>
            </details>
          )}
        </div>
      ) : (
        /* Level 3 reached. This used to be one grey line ("حساب شما کاملاً
           تأیید شده است") and nothing else — the approval was invisible. Now
           the badge itself is the payoff, with the company name on it. */
        <div className={styles.maxed}>
          <BusinessAccountBadge companyName={verifiedCompanyName} />
          <p className={styles.maxedNote}>{t('maxedNote')}</p>
        </div>
      )}
    </section>
  );
}

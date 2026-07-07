'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { http } from '@/lib/api/http';
import { LEVEL_INFO } from '@/lib/data/verification';
import { toPersianDigits } from '@/lib/utils/format';
import { useToast } from '@/lib/hooks/useToast';
import { ApiError } from '@/lib/api/errors';
import { Badge } from '@/components/ui';
import { TextInput } from '@/components/forms/fields';
import { Button } from '@/components/primitives/Button';
import { CheckCircleIcon, ShieldIcon } from '@/components/primitives/icons';
import styles from './VerificationCard.module.css';

type VStatus = 'none' | 'pending' | 'approved' | 'rejected';

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
}: {
  level: 1 | 2 | 3;
  idStatus: VStatus;
  bizStatus: VStatus;
}) {
  const router = useRouter();
  const toast = useToast();
  const [nationalId, setNationalId] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyNationalId, setCompanyNationalId] = useState('');
  const [economicCode, setEconomicCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (body: Record<string, unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      await http.post('/api/me/verification', body);
      toast.success('اطلاعات شما ثبت شد و در حال بررسی است.');
      router.refresh();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'ثبت اطلاعات ناموفق بود.');
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
            احراز هویت
          </h3>
          <p className={styles.currentLevel}>
            سطح فعلی شما: <Badge tone="success">سطح {toPersianDigits(level)} — {LEVEL_INFO[level].name}</Badge>
          </p>
        </div>
      </div>

      {/* what's already unlocked */}
      <ul className={styles.unlocked}>
        {LEVEL_INFO[level].unlocks.map((u) => (
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
              با ارتقا به سطح {toPersianDigits(nextLevel)} ({LEVEL_INFO[nextLevel].name}) این‌ها را باز کنید:
            </span>
          </div>
          <ul className={styles.nextPerks}>
            {LEVEL_INFO[nextLevel].unlocks.map((u) => (
              <li key={u}>{u}</li>
            ))}
          </ul>

          {nextStatus === 'pending' ? (
            <p className={styles.pending}>
              <Badge tone="stale">در حال بررسی</Badge> اطلاعات شما ثبت شده و کارشناس آن را بررسی می‌کند.
            </p>
          ) : (
            <form
              className={styles.form}
              onSubmit={(e) => {
                e.preventDefault();
                if (busy) return;
                if (nextLevel === 2) submit({ level: 2, nationalId });
                else submit({ level: 3, companyName, companyNationalId, economicCode });
              }}
            >
              {nextStatus === 'rejected' ? (
                <p className={styles.rejected}>اطلاعات قبلی تأیید نشد؛ لطفاً دوباره و دقیق وارد کنید.</p>
              ) : null}
              {nextLevel === 2 ? (
                <TextInput
                  label="کد ملی"
                  inputMode="numeric"
                  dir="ltr"
                  maxLength={10}
                  value={nationalId}
                  onChange={(e) => setNationalId(e.target.value)}
                />
              ) : (
                <>
                  <TextInput
                    label="نام شرکت"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                  />
                  <TextInput
                    label="شناسهٔ ملی شرکت"
                    inputMode="numeric"
                    dir="ltr"
                    maxLength={11}
                    value={companyNationalId}
                    onChange={(e) => setCompanyNationalId(e.target.value)}
                  />
                  <TextInput
                    label="کد اقتصادی"
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
                ثبت برای بررسی
              </Button>
            </form>
          )}
        </div>
      ) : (
        <p className={styles.maxed}>
          <Badge tone="action">بالاترین سطح احراز</Badge> حساب شما کاملاً تأیید شده است.
        </p>
      )}
    </section>
  );
}

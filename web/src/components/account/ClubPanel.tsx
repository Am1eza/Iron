import { toPersianDigits } from '@/lib/utils/format';
import { CLUB_TIER_META, CLUB_TIERS_ORDERED, type ClubTierKey } from '@/lib/data/club';
import type { ClubStatus } from '@/lib/server/repos/clubRepo';
import { Badge } from '@/components/ui';
import { StarIcon, CheckCircleIcon } from '@/components/primitives/icons';
import { JoinClubButton } from './JoinClubButton';
import { InviteCode } from './InviteCode';
import styles from './ClubPanel.module.css';

/**
 * In-account club panel (server component) — the fix for the old dead-end that
 * bounced a logged-in user to the public landing's "ثبت‌نام / ورود" CTA. Fed
 * directly by clubStatus(userId), so there is no client fetch to 401 and no
 * login loop. Shows the live tier, points, a goal-gradient progress bar to the
 * next tier, the perks each tier unlocks, and the user's invite code.
 */
const fa = (n: number) => toPersianDigits(n.toLocaleString('en-US'));

export function ClubPanel({ status, inviteCode }: { status: ClubStatus; inviteCode?: string }) {
  if (!status.member) {
    return (
      <div className={styles.joinWrap}>
        <span className={styles.joinMedal} aria-hidden="true">
          <StarIcon size={28} filled />
        </span>
        <h3 className={styles.joinTitle}>به باشگاه مشتریان آهن‌تایم بپیوندید</h3>
        <p className={styles.joinLead}>
          عضویت رایگان است. با هر سفارش، تکمیل پروفایل و احراز هویت، امتیاز می‌گیرید و سطح‌تان بالا
          می‌رود — از تخفیف پلکانی تا مشاور اختصاصی.
        </p>
        <JoinClubButton />
        <ul className={styles.ladderPreview}>
          {CLUB_TIERS_ORDERED.map((t) => (
            <li key={t.key}>
              <strong>{t.name}</strong> — {t.tagline}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const tierKey = (status.tier ?? 'iron') as ClubTierKey;
  const meta = CLUB_TIER_META[tierKey];
  const next = status.nextTier;
  // Goal-gradient framing: far from the threshold, celebrate distance covered;
  // close to it, switch to distance remaining to pull the user over the line.
  const nearThreshold = next ? next.ratio >= 0.6 : false;

  return (
    <div className={styles.wrap}>
      {/* ===== Current tier + progress ===== */}
      <section className={styles.hero}>
        <div className={styles.identity}>
          <span className={`${styles.medal} ${styles[`medal_${tierKey}`]}`} aria-hidden="true">
            <StarIcon size={26} filled />
          </span>
          <div>
            <span className={styles.tierEyebrow}>سطح شما</span>
            <h3 className={styles.tierName}>{meta.name}</h3>
            <p className={styles.tierTagline}>{meta.tagline}</p>
          </div>
        </div>
        <div className={styles.points}>
          <span className={`${styles.pointsValue} tnum`}>{fa(status.points)}</span>
          <span className={styles.pointsLabel}>امتیاز باشگاه</span>
        </div>
      </section>

      {next ? (
        <section className={styles.progress} aria-label="پیشرفت تا سطح بعد">
          <div className={styles.progressHead}>
            <span>
              {nearThreshold ? (
                <>
                  فقط <strong className="tnum">{fa(next.needsPoints)}</strong> امتیاز تا{' '}
                  <strong>{next.tierName}</strong>!
                </>
              ) : (
                <>
                  <strong className="tnum">{fa(status.points)}</strong> امتیاز جمع کرده‌اید — در مسیر{' '}
                  <strong>{next.tierName}</strong>
                </>
              )}
            </span>
          </div>
          <div className={styles.track}>
            <div className={styles.fill} style={{ inlineSize: `${Math.round(next.ratio * 100)}%` }} />
          </div>
        </section>
      ) : (
        <section className={styles.progress}>
          <Badge tone="action">بالاترین سطح باشگاه</Badge>
          <span className={styles.topNote}>به بالاترین سطح رسیده‌اید — از همهٔ مزایا بهره‌مندید.</span>
        </section>
      )}

      {/* ===== Where your points come from ===== */}
      <section className={styles.breakdown}>
        <h4 className={styles.breakdownTitle}>امتیازهای شما</h4>
        <ul className={styles.breakdownList}>
          <BreakdownRow label="سفارش‌های تحویل‌شده" count={status.deliveredOrders} points={status.breakdown.fromOrders} />
          <BreakdownRow label="تکمیل پروفایل" points={status.breakdown.fromProfile} done={status.profileComplete} />
          <BreakdownRow
            label={`احراز هویت (سطح ${toPersianDigits(status.verificationLevel)})`}
            points={status.breakdown.fromVerification}
            done={status.verificationLevel > 1}
          />
          <BreakdownRow label="معرفی دوستان" count={status.qualifiedReferrals} points={status.breakdown.fromReferrals} />
        </ul>
      </section>

      {/* ===== The ladder + perks ===== */}
      <section className={styles.ladder}>
        {CLUB_TIERS_ORDERED.map((t) => {
          const active = t.key === tierKey;
          return (
            <div key={t.key} className={`${styles.ladderTier} ${active ? styles.ladderActive : ''}`}>
              <div className={styles.ladderHead}>
                <span className={styles.ladderName}>{t.name}</span>
                {active ? <Badge tone="action">سطح فعلی</Badge> : null}
              </div>
              <ul className={styles.perks}>
                {t.perks.map((p) => (
                  <li key={p}>
                    <CheckCircleIcon size={16} aria-hidden="true" className={styles.perkIcon} />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>

      {inviteCode ? <InviteCode code={inviteCode} /> : null}
    </div>
  );
}

function BreakdownRow({
  label,
  points,
  count,
  done,
}: {
  label: string;
  points: number;
  count?: number;
  done?: boolean;
}) {
  const has = points > 0 || done;
  return (
    <li className={styles.breakdownRow} data-has={has ? '' : undefined}>
      <span className={styles.breakdownLabel}>
        {label}
        {count !== undefined ? <span className={styles.breakdownCount}> ({toPersianDigits(count)})</span> : null}
      </span>
      <span className={`${styles.breakdownPoints} tnum`}>
        {points > 0 ? `+${toPersianDigits(points)}` : done ? '✓' : '—'}
      </span>
    </li>
  );
}

'use client';
import { useTranslations } from 'next-intl';
import { toPersianDigits } from '@/lib/utils/format';
import { CLUB_TIERS_ORDERED, type ClubTierKey } from '@/lib/data/club';
import type { ClubStatus, Letterhead } from '@/lib/server/repos/clubRepo';
import { Badge } from '@/components/ui';
import { StarIcon, CheckCircleIcon } from '@/components/primitives/icons';
import { JoinClubButton } from './JoinClubButton';
import { InviteCode } from './InviteCode';
import { LetterheadForm } from './LetterheadForm';
import styles from './ClubPanel.module.css';

/**
 * In-account club panel — the fix for the old dead-end that bounced a
 * logged-in user to the public landing's "ثبت‌نام / ورود" CTA. Fed directly by
 * clubStatus(userId) (data-only props, no functions crossing the boundary),
 * so promoting this to a Client Component for translation is safe. Shows the
 * live tier, points, a goal-gradient progress bar to the next tier, the perks
 * each tier unlocks, and the user's invite code.
 *
 * `CLUB_TIER_META` (lib/data/club.ts) stays the fa-only source of truth —
 * shared with the public landing (ClubLanding.tsx) and admin, both out of
 * scope here — so tier name/tagline/perk copy is translated locally via the
 * `account.club.tiers` keys, keyed by `tierKey`, rather than restructuring
 * that shared file.
 */
const fa = (n: number) => toPersianDigits(n.toLocaleString('en-US'));

const TIER_PERK_COUNT: Record<ClubTierKey, number> = { iron: 3, steel: 3, poolad: 5 };

export function ClubPanel({
  status,
  inviteCode,
  letterhead,
}: {
  status: ClubStatus;
  inviteCode?: string;
  /** Only ever passed for a پولادی member (see the account page's tab
   *  handler) — its mere presence, not a separate tier check here, is what
   *  decides whether the letterhead editor renders below. */
  letterhead?: Letterhead | null;
}) {
  const t = useTranslations('account.club');

  const tierName = (key: ClubTierKey) => t(`tiers.${key}.name`);
  const tierTagline = (key: ClubTierKey) => t(`tiers.${key}.tagline`);
  const tierPerks = (key: ClubTierKey) =>
    Array.from({ length: TIER_PERK_COUNT[key] }, (_, i) => t(`tiers.${key}.perk${i + 1}`));

  if (!status.member) {
    return (
      <div className={styles.joinWrap}>
        <span className={styles.joinMedal} aria-hidden="true">
          <StarIcon size={28} filled />
        </span>
        <h3 className={styles.joinTitle}>{t('joinHeadline')}</h3>
        <p className={styles.joinLead}>{t('joinLead')}</p>
        <JoinClubButton />
        <ul className={styles.ladderPreview}>
          {CLUB_TIERS_ORDERED.map((tier) => (
            <li key={tier.key}>
              <strong>{tierName(tier.key)}</strong>: {tierTagline(tier.key)}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const tierKey = (status.tier ?? 'iron') as ClubTierKey;
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
            <span className={styles.tierEyebrow}>{t('levelEyebrow')}</span>
            <h3 className={styles.tierName}>{tierName(tierKey)}</h3>
            <p className={styles.tierTagline}>{tierTagline(tierKey)}</p>
          </div>
        </div>
        <div className={styles.points}>
          <span className={`${styles.pointsValue} tnum`}>{fa(status.points)}</span>
          <span className={styles.pointsLabel}>{t('pointsLabel')}</span>
        </div>
      </section>

      {next ? (
        <section className={styles.progress} aria-label={t('progressAriaLabel')}>
          <div className={styles.progressHead}>
            <span>
              {nearThreshold
                ? t.rich('nearThreshold', {
                    points: fa(next.needsPoints),
                    tier: tierName(next.tier as ClubTierKey),
                    pts: (chunks) => <strong className="tnum">{chunks}</strong>,
                    tierTag: (chunks) => <strong>{chunks}</strong>,
                  })
                : t.rich('farThreshold', {
                    points: fa(status.points),
                    tier: tierName(next.tier as ClubTierKey),
                    pts: (chunks) => <strong className="tnum">{chunks}</strong>,
                    tierTag: (chunks) => <strong>{chunks}</strong>,
                  })}
            </span>
          </div>
          <div className={styles.track}>
            <div className={styles.fill} style={{ inlineSize: `${Math.round(next.ratio * 100)}%` }} />
          </div>
        </section>
      ) : (
        <section className={styles.progress}>
          <Badge tone="action">{t('highestBadge')}</Badge>
          <span className={styles.topNote}>{t('highestNote')}</span>
        </section>
      )}

      {/* ===== Where your points come from ===== */}
      <section className={styles.breakdown}>
        <h4 className={styles.breakdownTitle}>{t('breakdownTitle')}</h4>
        <ul className={styles.breakdownList}>
          <BreakdownRow
            label={t('breakdown.deliveredOrders')}
            count={status.deliveredOrders}
            points={status.breakdown.fromOrders}
          />
          <BreakdownRow
            label={t('breakdown.profileComplete')}
            points={status.breakdown.fromProfile}
            done={status.profileComplete}
          />
          <BreakdownRow
            label={t('breakdown.verificationLevel', { level: toPersianDigits(status.verificationLevel) })}
            points={status.breakdown.fromVerification}
            done={status.verificationLevel > 1}
          />
          <BreakdownRow
            label={t('breakdown.referrals')}
            count={status.qualifiedReferrals}
            points={status.breakdown.fromReferrals}
          />
        </ul>
      </section>

      {/* ===== The ladder + perks ===== */}
      <section className={styles.ladder}>
        {CLUB_TIERS_ORDERED.map((tier) => {
          const active = tier.key === tierKey;
          return (
            <div key={tier.key} className={`${styles.ladderTier} ${active ? styles.ladderActive : ''}`}>
              <div className={styles.ladderHead}>
                <span className={styles.ladderName}>{tierName(tier.key)}</span>
                {active ? <Badge tone="action">{t('ladderCurrentBadge')}</Badge> : null}
              </div>
              <ul className={styles.perks}>
                {tierPerks(tier.key).map((p) => (
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

      {letterhead ? <LetterheadForm initial={letterhead} /> : null}

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
        {points > 0 ? `+${toPersianDigits(points)}` : done ? '✓' : '۰'}
      </span>
    </li>
  );
}

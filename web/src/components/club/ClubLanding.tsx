'use client';
import { useTranslations, useLocale } from 'next-intl';
import { routes } from '@/lib/routes';
import {
  Container,
  Section,
  Stack,
  Grid,
  Heading,
  Text,
  Overline,
  Badge,
  Breadcrumbs,
  Card,
  Divider,
} from '@/components/ui';
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd';
import { CLUB_TIERS_ORDERED, type ClubTierKey } from '@/lib/data/club';
import { localizeDigits } from '@/lib/utils/format';
import {
  CheckCircleIcon,
  StarIcon,
  PhoneIcon,
} from '@/components/primitives/icons';
import { ClubCtas } from './ClubCtas';
import styles from './ClubLanding.module.css';

/** Tiers come from the shared metadata (src/lib/data/club.ts) so the landing,
 *  the in-account panel, and admin all show the exact same perks. Names/
 *  taglines/perks translate via `account.club.tiers`, the exact keys
 *  `ClubPanel.tsx` (the in-account panel) already added — not duplicated
 *  here, kept in sync with that one source. */
const TIERS = CLUB_TIERS_ORDERED;
const TIER_PERK_COUNT: Record<ClubTierKey, number> = { iron: 3, steel: 3, poolad: 5 };

const STEP_COUNT = 3;

/**
 * باشگاه مشتریان آهن‌تایم — a calm, aspirational landing for the loyalty program.
 * Client Component (was a Server Component) so it can localize: three
 * ascending tiers, a benefits grid, the three-step join flow, and the
 * primary login / account CTAs (`ClubCtas`, already client for its
 * auth-aware branching). Light and minimal.
 */
export function ClubLanding() {
  const t = useTranslations('clubLanding');
  const tTier = useTranslations('account.club.tiers');
  const tNav = useTranslations('nav');
  const locale = useLocale();
  // Client-rendered start to finish (no Server Component parent providing a
  // fa-only shell here, unlike most pages' breadcrumbs), so these translate
  // too — same tNav('home') pattern SkuDetail.tsx already uses; the club
  // label reuses `overline` rather than a new key, since it's already the
  // exact same "باشگاه مشتریان" text.
  const crumbs = [
    { label: tNav('home'), href: routes.home() },
    { label: t('overline'), href: routes.club() },
  ];
  const steps = Array.from({ length: STEP_COUNT }, (_, i) => ({
    title: t(`steps.step${i + 1}.title`),
    body: t(`steps.step${i + 1}.body`),
  }));

  return (
    <Container>
      <BreadcrumbJsonLd items={crumbs} />

      <Section space={10}>
        <Stack gap={12}>
          {/* ===== Hero ===== */}
          <header className={styles.hero}>
            <Breadcrumbs items={crumbs} />
            <Stack gap={4}>
              <Overline>{t('overline')}</Overline>
              <Heading level={1} className={styles.heroTitle}>
                {t('h1')}
              </Heading>
              <Text variant="body-lg" color="muted" className={styles.heroLead}>
                {t('heroLead')}
              </Text>
            </Stack>
            <ClubCtas
              wrapClass={styles.heroCtas ?? ''}
              primaryClass={`${styles.btn} ${styles.btnPrimary}`}
              ghostClass={`${styles.btn} ${styles.btnGhost}`}
            />
            <p className={styles.heroHint}>
              <StarIcon size={15} filled aria-hidden="true" />
              {t('heroHint')}
            </p>
          </header>

          {/* ===== Tiers ===== */}
          <section aria-labelledby="club-tiers" className={styles.block}>
            <Stack gap={6}>
              <div className={styles.blockHead}>
                <Heading level={2} id="club-tiers">
                  {t('tiersHeading')}
                </Heading>
                <Text color="muted">{t('tiersSub')}</Text>
              </div>

              <Grid gap={5} min="280px" className={styles.tierGrid}>
                {TIERS.map((tier, i) => {
                  const perks = Array.from({ length: TIER_PERK_COUNT[tier.key] }, (_, p) =>
                    tTier(`${tier.key}.perk${p + 1}`),
                  );
                  return (
                    <Card
                      key={tier.key}
                      as="article"
                      className={`${styles.tier} ${tier.featured ? styles.tierFeatured : ''}`}
                    >
                      <div className={styles.tierTop}>
                        <span className={styles.tierLevel}>
                          {t('levelLabel', { n: localizeDigits(i + 1, locale) })}
                        </span>
                        {tier.featured ? <Badge tone="action">{t('mostPopular')}</Badge> : null}
                      </div>
                      <div className={styles.tierIdentity}>
                        <span className={styles.tierMedal} aria-hidden="true">
                          <StarIcon size={20} filled={Boolean(tier.featured)} />
                        </span>
                        <div>
                          <h3 className={styles.tierName}>{tTier(`${tier.key}.name`)}</h3>
                          <p className={styles.tierTagline}>{tTier(`${tier.key}.tagline`)}</p>
                        </div>
                      </div>
                      <Divider />
                      <ul className={styles.perks}>
                        {perks.map((perk) => (
                          <li key={perk} className={styles.perk}>
                            <CheckCircleIcon size={18} aria-hidden="true" className={styles.perkIcon} />
                            <span>{perk}</span>
                          </li>
                        ))}
                      </ul>
                    </Card>
                  );
                })}
              </Grid>
            </Stack>
          </section>

          {/* ===== How to join ===== */}
          <section aria-labelledby="club-join" className={styles.block}>
            <Stack gap={6}>
              <div className={styles.blockHead}>
                <Heading level={2} id="club-join">
                  {t('joinHeading')}
                </Heading>
                <Text color="muted">{t('joinSub')}</Text>
              </div>

              <ol className={styles.steps}>
                {steps.map((step, i) => (
                  <li key={step.title} className={styles.step}>
                    <span className={`${styles.stepNum} tnum`} aria-hidden="true">
                      {localizeDigits(i + 1, locale)}
                    </span>
                    <div className={styles.stepBody}>
                      <h3 className={styles.stepTitle}>{step.title}</h3>
                      <p className={styles.stepText}>{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </Stack>
          </section>

          {/* ===== Closing CTA ===== */}
          <section aria-labelledby="club-cta" className={styles.closing}>
            <Stack gap={4} align="center">
              <Heading level={2} id="club-cta" className={styles.closingTitle}>
                {t('closingHeading')}
              </Heading>
              <Text color="muted" align="center" className={styles.closingLead}>
                {t('closingLead')}
              </Text>
              <ClubCtas
                wrapClass={styles.heroCtas ?? ''}
                primaryClass={`${styles.btn} ${styles.btnPrimary}`}
                ghostClass={`${styles.btn} ${styles.btnGhost}`}
              />
              <p className={styles.closingNote}>
                <PhoneIcon size={15} aria-hidden="true" />
                {t('closingNote')}
              </p>
            </Stack>
          </section>
        </Stack>
      </Section>
    </Container>
  );
}

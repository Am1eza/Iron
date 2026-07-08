import Link from 'next/link';
import type { ReactNode } from 'react';
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
import { CLUB_TIERS_ORDERED } from '@/lib/data/club';
import {
  CheckCircleIcon,
  StarIcon,
  PhoneIcon,
  ArrowEndIcon,
} from '@/components/primitives/icons';
import styles from './ClubLanding.module.css';

/** Tiers come from the shared metadata (src/lib/data/club.ts) so the landing,
 *  the in-account panel, and admin all show the exact same perks. */
const TIERS = CLUB_TIERS_ORDERED;


/** «چطور عضو شویم؟» — three sequential steps. */
const STEPS: { title: string; body: string }[] = [
  {
    title: 'ثبت‌نام با موبایل',
    body: 'با شمارهٔ موبایل خود در چند ثانیه ثبت‌نام کنید و به سطح «آهنی» بپیوندید.',
  },
  {
    title: 'اولین استعلام یا خرید',
    body: 'محصول‌ها را به سبد استعلام اضافه کنید؛ تیم ما برای پیش‌فاکتور با شما تماس می‌گیرد.',
  },
  {
    title: 'ارتقای سطح',
    body: 'با تداوم همکاری به‌صورت خودکار به «فولادی» و سپس «پولادی» ارتقا می‌یابید.',
  },
];

/**
 * باشگاه مشتریان آهن‌تایم — a calm, aspirational landing for the loyalty program.
 * Server-rendered (no interactivity): three ascending tiers, a benefits grid, the
 * three-step join flow, and the primary login / account CTAs. Light and minimal.
 */
export function ClubLanding() {
  const crumbs = [
    { label: 'خانه', href: routes.home() },
    { label: 'باشگاه مشتریان' },
  ];

  return (
    <Container>
      <BreadcrumbJsonLd items={crumbs} />

      <Section space={10}>
        <Stack gap={12}>
          {/* ===== Hero ===== */}
          <header className={styles.hero}>
            <Breadcrumbs items={crumbs} />
            <Stack gap={4}>
              <Overline>باشگاه مشتریان</Overline>
              <Heading level={1} className={styles.heroTitle}>
                باشگاه مشتریان آهن‌تایم
              </Heading>
              <Text variant="body-lg" color="muted" className={styles.heroLead}>
                وفاداری شما ارزش دارد. با هر استعلام و خرید، سطح‌تان بالا می‌رود و از تخفیف پلکانی،
                اولویت در تأمین، هشدار قیمت اختصاصی و مشاور اختصاصی بهره‌مند می‌شوید — همان فلسفهٔ
                همیشگی ما: «اول مشورت، بعد خرید».
              </Text>
            </Stack>
            <div className={styles.heroCtas}>
              <Link href={routes.login(routes.club())} className={`${styles.btn} ${styles.btnPrimary}`}>
                ثبت‌نام / ورود
                <ArrowEndIcon size={18} aria-hidden="true" />
              </Link>
              <Link href={routes.account('club')} className={`${styles.btn} ${styles.btnGhost}`}>
                حساب من
              </Link>
            </div>
            <p className={styles.heroHint}>
              <StarIcon size={15} filled aria-hidden="true" />
              عضویت رایگان است و با اولین ثبت‌نام فعال می‌شود.
            </p>
          </header>

          {/* ===== Tiers ===== */}
          <section aria-labelledby="club-tiers" className={styles.block}>
            <Stack gap={6}>
              <div className={styles.blockHead}>
                <Heading level={2} id="club-tiers">
                  سه سطح، مزایای فزاینده
                </Heading>
                <Text color="muted">
                  از «آهنی» شروع می‌کنید و با تداوم همکاری به «فولادی» و «پولادی» می‌رسید.
                </Text>
              </div>

              <Grid gap={5} min="280px" className={styles.tierGrid}>
                {TIERS.map((tier, i) => (
                  <Card
                    key={tier.key}
                    as="article"
                    className={`${styles.tier} ${tier.featured ? styles.tierFeatured : ''}`}
                  >
                    <div className={styles.tierTop}>
                      <span className={styles.tierLevel}>سطح {toFaLevel(i)}</span>
                      {tier.featured ? <Badge tone="action">محبوب‌ترین</Badge> : null}
                    </div>
                    <div className={styles.tierIdentity}>
                      <span className={styles.tierMedal} aria-hidden="true">
                        <StarIcon size={20} filled={Boolean(tier.featured)} />
                      </span>
                      <div>
                        <h3 className={styles.tierName}>{tier.name}</h3>
                        <p className={styles.tierTagline}>{tier.tagline}</p>
                      </div>
                    </div>
                    <Divider />
                    <ul className={styles.perks}>
                      {tier.perks.map((perk) => (
                        <li key={perk} className={styles.perk}>
                          <CheckCircleIcon size={18} aria-hidden="true" className={styles.perkIcon} />
                          <span>{perk}</span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                ))}
              </Grid>
            </Stack>
          </section>

          {/* ===== How to join ===== */}
          <section aria-labelledby="club-join" className={styles.block}>
            <Stack gap={6}>
              <div className={styles.blockHead}>
                <Heading level={2} id="club-join">
                  چطور عضو شویم؟
                </Heading>
                <Text color="muted">سه گام ساده تا اولین مزایای باشگاه.</Text>
              </div>

              <ol className={styles.steps}>
                {STEPS.map((step, i) => (
                  <li key={step.title} className={styles.step}>
                    <span className={`${styles.stepNum} tnum`} aria-hidden="true">
                      {toFaLevel(i)}
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
                همین حالا عضو شوید
              </Heading>
              <Text color="muted" align="center" className={styles.closingLead}>
                با یک شماره موبایل عضو می‌شوید و از همان اولین استعلام، باشگاه کنار شماست.
              </Text>
              <div className={styles.heroCtas}>
                <Link
                  href={routes.login(routes.club())}
                  className={`${styles.btn} ${styles.btnPrimary}`}
                >
                  ثبت‌نام / ورود
                  <ArrowEndIcon size={18} aria-hidden="true" />
                </Link>
                <Link href={routes.account('club')} className={`${styles.btn} ${styles.btnGhost}`}>
                  حساب من
                </Link>
              </div>
              <p className={styles.closingNote}>
                <PhoneIcon size={15} aria-hidden="true" />
                سؤالی دارید؟ کارشناسان ما آمادهٔ راهنمایی شما هستند.
              </p>
            </Stack>
          </section>
        </Stack>
      </Section>
    </Container>
  );
}

/** Persian ordinal digit for tier/step index (0-based → ۱، ۲، ۳). */
function toFaLevel(i: number): string {
  const digits = ['۱', '۲', '۳', '۴', '۵'];
  return digits[i] ?? String(i + 1);
}

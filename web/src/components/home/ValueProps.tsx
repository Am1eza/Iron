'use client';
import { useLocale, useTranslations } from 'next-intl';
import { AiMarkIcon, TagIcon, BankIcon, CalendarIcon } from '@/components/primitives/icons';
import { toPersianDigits } from '@/lib/utils/format';
import styles from './ValueProps.module.css';

/**
 * «خرید چطور کار می‌کند» — the B2B process strip. Replaces the old value-props
 * grid whose two featured tiles restated the hero (smart advisor, transparent
 * prices) one viewport after the hero demonstrated them. The four steps now
 * carry the page's genuinely NEW information — official proforma, بورس/LC
 * sourcing, scheduled delivery, human follow-through — as the buying journey
 * itself.
 *
 * `'use client'` only so the copy participates in the client-side locale swap
 * (see `i18n/LocaleProvider` — server-rendered text is always the static `fa`
 * shell). No state, no effects, no observers: it still server-renders to the
 * same markup it always did.
 */
const STEPS = [
  { key: 'step1', Icon: AiMarkIcon },
  { key: 'step2', Icon: TagIcon },
  { key: 'step3', Icon: BankIcon },
  // W22: was BellIcon — a bell on the homepage that had nothing to do with
  // price alerts (the real bell-worthy feature) just muddied that icon's
  // meaning everywhere else it's used for alerts.
  { key: 'step4', Icon: CalendarIcon },
] as const;

export function ValueProps() {
  const t = useTranslations('home.how');
  const locale = useLocale();

  return (
    <section className={styles.section} aria-labelledby="how-title">
      <div className="container">
        <div className={styles.head}>
          <p className={styles.eyebrow}>{t('eyebrow')}</p>
          <h2 id="how-title" className={styles.title}>
            {t('title')}
          </h2>
        </div>

        <ol className={styles.steps}>
          {STEPS.map(({ key, Icon }, i) => (
            <li key={key} className={styles.step}>
              <span className={styles.stepIndex} aria-hidden="true">
                {locale === 'fa' ? toPersianDigits(i + 1) : i + 1}
              </span>
              <span className={styles.stepIcon} aria-hidden="true">
                <Icon size={22} />
              </span>
              <h3 className={styles.stepTitle}>{t(`${key}.title`)}</h3>
              <p className={styles.stepText}>{t(`${key}.text`)}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

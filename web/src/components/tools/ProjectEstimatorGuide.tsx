'use client';
import { useTranslations } from 'next-intl';
import { faqJsonLd } from '@/lib/seo';
import { JsonLd } from '@/components/seo/JsonLd';
import { Stack, Heading, Text } from '@/components/ui';
import styles from './ProjectEstimatorGuide.module.css';

/**
 * SEO/AEO explainer for /tools/project — Amir asked for an article-style
 * section under the tool explaining the calculation method, written for
 * search AND answer engines (Google AI Overviews, "People also ask", voice
 * assistants). Every number below is the exact source-cited range already
 * shown in the tool's own disclaimer (see ProjectEstimator.tsx's constants —
 * CONCRETE_LATERAL_SYSTEMS / STEEL_LATERAL_SYSTEMS / ROOF_SYSTEMS /
 * CONCRETE_M3_RANGE) — duplicated here as plain prose, not re-derived, so the
 * two can never silently disagree; if a coefficient changes there, mirror it
 * here (in every locale) in the same PR.
 *
 * FAQPage JSON-LD (see lib/seo.ts's faqJsonLd) is the AEO half: each answer
 * is written to stand alone when quoted out of page context, which is
 * exactly how an answer engine consumes it.
 *
 * A client component (i18n audit follow-up) so this renders in the visitor's
 * actual locale — like every other tool component this session translated,
 * it still SSRs the fa shell first (this app's cookie-based locale never
 * changes what the ISR-cached HTML/JSON-LD first paints — see
 * `src/i18n/request.ts`'s own header comment) and hydrates to the real
 * locale client-side, so this is not an SEO regression: a crawler saw fa
 * before this change and still does now.
 */

const FAQ_KEYS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'] as const;

export function ProjectEstimatorGuide() {
  const t = useTranslations('projectEstimatorGuide');
  const faq = FAQ_KEYS.map((key) => ({
    question: t(`faq.${key}.question`),
    answer: t(`faq.${key}.answer`),
  }));

  return (
    <section aria-labelledby="project-guide-title">
      <Stack gap={6}>
      <JsonLd data={faqJsonLd(faq)} />

      <Stack gap={4}>
        <Heading level={2} id="project-guide-title">
          {t('title')}
        </Heading>
        <Text color="muted">{t('intro')}</Text>
      </Stack>

      <Stack gap={3}>
        <Heading level={3}>{t('concreteHeading')}</Heading>
        <Text color="muted">{t('concreteBody')}</Text>
      </Stack>

      <Stack gap={3}>
        <Heading level={3}>{t('steelHeading')}</Heading>
        <Text color="muted">{t('steelBody')}</Text>
      </Stack>

      <Stack gap={3}>
        <Heading level={3}>{t('shedHeading')}</Heading>
        <Text color="muted">{t('shedBody')}</Text>
      </Stack>

      <Stack gap={4}>
        <Heading level={2}>{t('faqHeading')}</Heading>
        <dl className={styles.faqList}>
          {faq.map((item) => (
            <div key={item.question} className={styles.faqItem}>
              <dt>
                <Heading level={4} className={styles.faqQuestion}>
                  {item.question}
                </Heading>
              </dt>
              <dd>
                <Text color="muted">{item.answer}</Text>
              </dd>
            </div>
          ))}
        </dl>
      </Stack>
      </Stack>
    </section>
  );
}

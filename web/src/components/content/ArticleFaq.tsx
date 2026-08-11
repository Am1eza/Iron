import { faqJsonLd } from '@/lib/seo';
import { JsonLd } from '@/components/seo/JsonLd';
import { Heading, Text } from '@/components/ui';
import styles from './ArticleFaq.module.css';

/**
 * The FAQ section every article page (blog and news both) renders — US-14.7.
 * Admin-editable per article (`ContentQueue`'s `FaqField`), unlike the fixed
 * `FAQ` constant `ProjectEstimatorGuide` uses for the /tools/project page;
 * this component is the shared renderer both call sites (and any future
 * one) draw from, so the visible list and the FAQPage JSON-LD can never
 * drift into two different sets of questions the way two independently
 * hand-written copies eventually would.
 *
 * Renders nothing when the article has no FAQ — never a fabricated
 * placeholder question just to fill the section.
 */
export function ArticleFaq({ items }: { items: { question: string; answer: string }[] }) {
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="article-faq-title">
      <JsonLd data={faqJsonLd(items)} />
      <Heading level={2} id="article-faq-title">
        سوالات متداول
      </Heading>
      <dl className={styles.faqList}>
        {items.map((item, i) => (
          <div key={i} className={styles.faqItem}>
            <dt>
              <Heading level={3} className={styles.faqQuestion}>
                {item.question}
              </Heading>
            </dt>
            <dd>
              <Text color="muted">{item.answer}</Text>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

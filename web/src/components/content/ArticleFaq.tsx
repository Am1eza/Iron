import { faqJsonLd } from '@/lib/seo';
import { JsonLd } from '@/components/seo/JsonLd';
import { Heading, Card, Text } from '@/components/ui';
import { ChevronDownIcon } from '@/components/primitives/icons';
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
 * Each question is a native <details>/<summary> disclosure, closed by
 * default, inside a bordered `Card` — not the plain `<dl>` of open dt/dd
 * pairs this used to be. That version rendered every answer pre-expanded at
 * the SAME h2/h3 weight as the article's own headings, with only a hairline
 * rule between items and the article body above; a reader could not tell
 * where the article ended and the FAQ began; it read as more paragraphs, not
 * a distinct, scannable Q&A module (confirmed against zoomit.ir and
 * apple.com's own FAQ accordions, both of which collapse by default behind
 * a bold clickable row + chevron). <details> gets the collapse, the
 * keyboard operability, and the "still in the DOM when closed" crawlability
 * for free — a hand-rolled button+aria-expanded version would have to
 * reimplement all three.
 *
 * Renders nothing when the article has no FAQ — never a fabricated
 * placeholder question just to fill the section.
 */
export function ArticleFaq({ items }: { items: { question: string; answer: string }[] }) {
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="article-faq-title">
      <JsonLd data={faqJsonLd(items)} />
      <Card className={styles.card}>
        <Heading level={2} id="article-faq-title">
          سوالات متداول
        </Heading>
        <div className={styles.faqList}>
          {items.map((item, i) => (
            <details key={i} className={styles.faqItem}>
              <summary className={styles.summary}>
                {/* A plain <h3>, not the shared `Heading` primitive: `Heading`
                    sets font via an inline style attribute, which no CSS
                    module rule can override — and the whole point here is a
                    row-sized question, not a full h3 heading. A bare
                    heading element as `summary`'s only child is valid HTML
                    and keeps the outline/AT experience the same. */}
                <h3 className={styles.question}>{item.question}</h3>
                <ChevronDownIcon size={20} className={styles.chevron} aria-hidden="true" />
              </summary>
              <Text color="muted" className={styles.answer}>
                {item.answer}
              </Text>
            </details>
          ))}
        </div>
      </Card>
    </section>
  );
}

import type { ExpertBlock } from '@/lib/ai/blocks';
import { toPersianDigits } from '@/lib/utils/format';
import { PhoneIcon, WhatsappIcon } from '@/components/primitives/icons';
import { CardHead } from './parts';
import styles from './blocks.module.css';

/**
 * The escape hatch, as a card.
 *
 * An advisor that will not admit the end of its own knowledge is worse than
 * one with less of it: the failure mode this replaces is a confident-sounding
 * paragraph assembled around a gap, or a conversation that simply stops. When
 * a tool finds nothing, or the question is more specific than the data can
 * answer, the honest next step is a person — and it should be one tap, with
 * the real number, not «با ما تماس بگیرید».
 *
 * `tel:`/`wa.me` links are LTR-forced: a Persian-digit phone number inside an
 * RTL paragraph reorders visually and a visitor reading it aloud dials wrong.
 */
export function ExpertCard({ block }: { block: ExpertBlock }) {
  return (
    <div className={`${styles.card} ${styles.cardExpert}`}>
      <CardHead badge="گفتگو با کارشناس" />
      <p className={styles.expertReason}>{block.reason}</p>
      <div className={styles.actions}>
        <a href={`tel:${block.phone}`} className={styles.actionPrimary} dir="ltr">
          <PhoneIcon size={15} aria-hidden="true" />
          <bdi>{toPersianDigits(block.phone)}</bdi>
        </a>
        <a
          href={block.whatsappUrl}
          className={styles.actionGhost}
          target="_blank"
          rel="noreferrer noopener"
        >
          <WhatsappIcon size={15} aria-hidden="true" />
          واتساپ
        </a>
      </div>
    </div>
  );
}

import { Fragment } from 'react';
import { optionMessage, type OptionsBlock } from '@/lib/ai/blocks';
import { toPersianDigits } from '@/lib/utils/format';
import { CardHead } from './parts';
import styles from './blocks.module.css';

/**
 * «کدام سایز؟», as buttons.
 *
 * This card is the direct answer to the complaint that started this work: ask
 * the advisor for the price of rebar and it used to reply with a sentence
 * asking which one, leaving the visitor to know — or guess — what the catalog
 * actually carries. Every chip here is a product line that really exists, and
 * tapping one submits its label as the next message, so a tap and typing the
 * same words take the identical path through the tools.
 *
 * Rendered as a `<fieldset>`/`<legend>`: this is a question with a fixed set
 * of answers, and a screen reader should hear the question before the first
 * option rather than encountering eight unexplained buttons in a row.
 */
export function OptionsCard({ block, onPick }: { block: OptionsBlock; onPick: (text: string) => void }) {
  return (
    <div className={styles.card}>
      <CardHead badge="انتخاب کن" />
      {block.groups.map((group) => (
        <fieldset key={group.title} className={styles.optionSet}>
          <legend className={styles.optionLegend}>
            {block.question}
            <span className={styles.optionDim}> · {group.title}</span>
          </legend>
          <div className={styles.optionChips}>
            {group.options.map((option, i) => (
              <Fragment key={option.label}>
                {/* A literal space so copying two adjacent chips does not glue
                    their labels together — flex `gap` inserts no character. */}
                {i > 0 && ' '}
                <button
                  type="button"
                  className={styles.optionChip}
                  onClick={() => onPick(optionMessage(option))}
                >
                  <span>{toPersianDigits(option.label)}</span>
                  {option.hint ? <span className={styles.optionHint}>{toPersianDigits(option.hint)}</span> : null}
                </button>
              </Fragment>
            ))}
          </div>
          {group.truncated ? (
            <p className={styles.optionMore}>
              گزینه‌های بیشتری هم هست؛ اگر موردت اینجا نیست، همان را بنویس.
            </p>
          ) : null}
        </fieldset>
      ))}
    </div>
  );
}

import { Fragment } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { optionMessage, type OptionsBlock } from '@/lib/ai/blocks';
import { localizeDigits } from '@/lib/utils/format';
import type { AppLocale } from '@/i18n/config';
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
  const t = useTranslations('ai.blocks');
  const locale = useLocale() as AppLocale;
  return (
    <div className={styles.card}>
      <CardHead badge={t('badges.options')} />
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
                  <span>{localizeDigits(option.label, locale)}</span>
                  {option.hint ? (
                    <span className={styles.optionHint}>{localizeDigits(option.hint, locale)}</span>
                  ) : null}
                </button>
              </Fragment>
            ))}
          </div>
          {group.truncated ? <p className={styles.optionMore}>{t('actions.moreOptions')}</p> : null}
        </fieldset>
      ))}
    </div>
  );
}

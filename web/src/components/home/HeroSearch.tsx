'use client';
import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { routes } from '@/lib/routes';
import { AiMarkIcon, ChevronStartIcon } from '@/components/primitives/icons';
import { toPersianDigits } from '@/lib/utils/format';
import styles from './HeroSearch.module.css';

/**
 * The «Steel Terminal» hero — an asymmetric split. Inline-start column: the brand
 * claim in Estedad Black + the AI search (the primary action) + starter chips.
 * The other column hosts the live PriceBoard (passed in as a server-rendered
 * slot). Start-aligned, no centered stack, price data as the visual anchor.
 *
 * All copy comes from the `home.hero` dictionary so it follows the client-side
 * locale switch; the starter chips are translated too, since they are sent
 * verbatim to the AI advisor as the visitor's own question.
 */
const STARTER_KEYS = ['starter1', 'starter2', 'starter3'] as const;

export function HeroSearch({
  board,
  stats,
}: {
  board?: ReactNode;
  /** REAL numbers computed server-side from the live catalog — trust line. */
  stats?: { skuCount: number; factoryCount: number };
}) {
  const t = useTranslations('home.hero');
  const locale = useLocale();
  const router = useRouter();
  const [q, setQ] = useState('');
  // Persian digits are for the Persian rendering only — an English or Chinese
  // reader gets Latin numerals.
  const num = (n: number) => (locale === 'fa' ? toPersianDigits(n) : String(n));
  const ask = (text: string) => {
    // NB: named `query`, not `t` as it once was — `t` is the translation
    // function in this scope now, and shadowing it here would be a trap.
    const query = text.trim();
    router.push(query ? `${routes.ai()}?q=${encodeURIComponent(query)}` : routes.ai());
  };

  return (
    <section className={styles.hero} aria-label={t('aria')}>
      <div className={`container ${styles.grid}`}>
        <div className={styles.copy}>
          <h1 className={styles.title}>
            {t('titleLine1')}
            <br />
            {t('titleLine2')}
          </h1>
          <p className={styles.sub}>{t('sub')}</p>

          <form
            className={styles.search}
            onSubmit={(e) => {
              e.preventDefault();
              ask(q);
            }}
            role="search"
            data-event="ai_entry"
          >
            <span className={styles.searchIcon} aria-hidden>
              <AiMarkIcon size={22} />
            </span>
            <input
              className={styles.searchInput}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('placeholder')}
              aria-label={t('inputAria')}
              enterKeyHint="send"
            />
            <button type="submit" className={styles.searchSend} aria-label={t('ask')}>
              <span className={styles.sendText}>{t('ask')}</span>
              <ChevronStartIcon size={18} className="icon--rtl" />
            </button>
          </form>

          {stats && stats.skuCount > 0 ? (
            <p className={`${styles.trust} tnum`}>
              {t('trust', { sku: num(stats.skuCount), factory: num(stats.factoryCount) })}
            </p>
          ) : null}

          <ul className={styles.chips} aria-label={t('startersLabel')}>
            {STARTER_KEYS.map((key) => {
              const text = t(key);
              return (
                <li key={key}>
                  <button type="button" className={styles.chip} onClick={() => ask(text)}>
                    {text}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {board && <div className={styles.boardCol}>{board}</div>}
      </div>
    </section>
  );
}

'use client';
import { useState, type ReactNode } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { routes } from '@/lib/routes';
import { AiMarkIcon, ArrowEndIcon, ChevronStartIcon } from '@/components/primitives/icons';
import styles from './HeroSearch.module.css';

/**
 * The «Steel Terminal» hero — an asymmetric split. Inline-start column: the brand
 * claim in Estedad Black + two CTAs (browse prices / advisor) + the advisor's
 * inline search shortcut + starter chips. The other column hosts the live
 * PriceBoard (passed in as a server-rendered slot). Start-aligned, no centered
 * stack, price data as the visual anchor.
 *
 * All copy comes from the `home.hero` dictionary so it follows the client-side
 * locale switch; the starter chips are translated too, since they are sent
 * verbatim to the AI advisor as the visitor's own question.
 */
const STARTER_KEYS = ['starter1', 'starter2', 'starter3'] as const;

export function HeroSearch({
  board,
  trust,
}: {
  board?: ReactNode;
  /** The trust line (real catalog counts), server-rendered and passed in as
   *  a slot so it can stream on its own — see HeroTrustLine. Kept out of
   *  this component's own props so the hero (board/video, the page's LCP
   *  element) never waits on the catalog fetch behind it. */
  trust?: ReactNode;
}) {
  const t = useTranslations('home.hero');
  const router = useRouter();
  const [q, setQ] = useState('');
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

          {/* Primary = browse prices directly; secondary = guided advisor path. */}
          <div className={styles.ctas}>
            <Link href={routes.prices()} className={`${styles.cta} ${styles.ctaPrimary}`}>
              {t('ctaPrices')}
              <ArrowEndIcon size={18} className="icon--rtl" />
            </Link>
            <Link
              href={routes.ai()}
              className={`${styles.cta} ${styles.ctaSecondary}`}
              data-event="ai_entry"
            >
              {t('ctaAdvisor')}
              <ArrowEndIcon size={18} className="icon--rtl" />
            </Link>
          </div>

          {trust}

          {/* Advisor's inline shortcut, fenced off from the CTA row above. */}
          <div className={styles.advisor}>
            <p className={styles.advisorLabel} id="hero-advisor-label">
              {t('advisorLabel')}
            </p>

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
        </div>

        {board && <div className={styles.boardCol}>{board}</div>}
      </div>
    </section>
  );
}

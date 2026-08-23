'use client';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import {
  AiMarkIcon,
  DocRequestIcon,
  UsersIcon,
  WarehouseIcon,
  CalculatorIcon,
  BlueprintIcon,
  ArrowEndIcon,
} from '@/components/primitives/icons';
import { routes } from '@/lib/routes';
import { toPersianDigits } from '@/lib/utils/format';
import styles from './WhyAhantime.module.css';

/**
 * «چرا آهن‌تایم» — the competitive-advantage block, the section between the
 * compare explorer and the «چطور کار می‌کند» process strip.
 *
 * It answers a different question from its two neighbours: ValueProps explains
 * HOW a purchase happens (the 4-step journey) and Partners shows WHO already
 * buys; this one states WHAT this marketplace does that a plain price-listing
 * competitor does not. The six points were confirmed by the owner and each is
 * backed by something that actually exists in this codebase — the AI advisor
 * with its `ai_conversations`/`ai_corrections` memory + correction loop, the
 * instant proforma + بورس/LC sourcing path, the industrial client roster, the
 * `warehouse_items`/`warehouse_settlements` managed-storage service, the four
 * free calculators in `TOOLS_NAV`, and the four B2B services in
 * `SERVICES_NAV_FULL`.
 *
 * **Every number here is passed in from the server**, derived from live data
 * the page already fetched (`stats`) or from the very nav arrays that render
 * the tools/services menus. Nothing is hardcoded, estimated, or rounded up —
 * same rule the hero's trust line follows.
 *
 * Two claims the owner explicitly held back are deliberately ABSENT and must
 * not be reintroduced without their sign-off: any "cheapest pipe price in the
 * market" claim (unverified), and the customer club's cashback (the
 * `club_memberships` table has no cashback/refund column — the feature does
 * not exist yet).
 *
 * Client component so it participates in the client-side locale switch (see
 * `i18n/LocaleProvider`); it holds no state and adds no listeners.
 */
export type WhyStats = {
  /** Priced SKUs in the live catalog. */
  skuCount: number;
  /** Distinct supplying mills across those SKUs. */
  factoryCount: number;
  /** Industrial clients whose logos the Partners strip actually shows. */
  clientCount: number;
  /** Free calculators in TOOLS_NAV. */
  toolCount: number;
  /** B2B services in SERVICES_NAV_FULL. */
  serviceCount: number;
};

export function WhyAhantime({ stats }: { stats: WhyStats }) {
  const t = useTranslations('home.why');
  const locale = useLocale();
  // Persian digits belong to the Persian rendering only — an English or
  // Chinese reader gets Latin numerals, not ۱۰۵۹.
  const num = (n: number) => (locale === 'fa' ? toPersianDigits(n) : String(n));

  const cards = [
    {
      key: 'ai',
      Icon: AiMarkIcon,
      href: routes.ai(),
      accent: true,
      meta: null,
    },
    {
      key: 'proforma',
      Icon: DocRequestIcon,
      href: routes.prices(),
      accent: false,
      meta: null,
    },
    {
      key: 'clients',
      Icon: UsersIcon,
      href: routes.about(),
      accent: false,
      meta: t('clients.meta', { count: num(stats.clientCount) }),
    },
    {
      key: 'warehouse',
      Icon: WarehouseIcon,
      href: routes.warehouse(),
      accent: false,
      meta: null,
    },
    {
      key: 'tools',
      Icon: CalculatorIcon,
      href: routes.tool('project'),
      accent: false,
      meta: t('tools.meta', { count: num(stats.toolCount) }),
    },
    {
      key: 'services',
      Icon: BlueprintIcon,
      href: routes.tender(),
      accent: false,
      meta: t('services.meta', { count: num(stats.serviceCount) }),
    },
  ] as const;

  return (
    <section className={styles.section} aria-labelledby="why-title">
      <div className="container">
        <div className={styles.head}>
          <p className={styles.eyebrow}>{t('eyebrow')}</p>
          <h2 id="why-title" className={styles.title}>
            {t('title')}
          </h2>
          {/* `tnum` on the paragraph rather than a rich-text span per number:
              the only digits in this sentence ARE the two counts, so one class
              gets the tabular-numeral rule CLAUDE.md requires without making
              every translator hand-place per-number tags. */}
          {stats.skuCount > 0 ? (
            <p className={`${styles.lead} tnum`}>
              {t('lead', { sku: num(stats.skuCount), factory: num(stats.factoryCount) })}
            </p>
          ) : null}
        </div>

        <ul className={styles.grid}>
          {cards.map(({ key, Icon, href, accent, meta }) => (
            <li key={key}>
              <Link href={href} className={styles.card}>
                <span
                  className={[styles.icon, accent ? styles.iconAccent : '']
                    .filter(Boolean)
                    .join(' ')}
                  aria-hidden="true"
                >
                  <Icon size={22} />
                </span>
                <h3 className={styles.cardTitle}>{t(`${key}.title`)}</h3>
                <p className={styles.cardText}>{t(`${key}.text`)}</p>
                {meta ? <p className={styles.meta}>{meta}</p> : null}
                <span className={styles.more} aria-hidden="true">
                  {t(`${key}.cta`)}
                  <ArrowEndIcon size={16} className="icon--rtl" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

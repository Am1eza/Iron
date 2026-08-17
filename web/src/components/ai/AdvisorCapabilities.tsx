import { ChartIcon, IBeamGlyph, InfoIcon } from '@/components/primitives/icons';
import { routes } from '@/lib/routes';
import Link from 'next/link';
import styles from './AdvisorCapabilities.module.css';

/**
 * What this advisor does that a general-purpose chat cannot — the three
 * capabilities that are REAL tools in `aiTools.ts` (`compareFactories`,
 * `calcWeight`, `searchGuides`), described in the terms a buyer would use.
 *
 * Deliberately three claims, each of which the page can back up on the spot:
 * nothing here is a capability the advisor doesn't have. It sits BELOW the
 * chat panel on purpose (see app/ai/page.tsx) — the composer is the page's
 * primary control and must stay one screen away, not below an explainer.
 */
const CAPABILITIES = [
  {
    Icon: ChartIcon,
    title: 'مقایسهٔ کارخانه‌ها روی تناژ خودت',
    body: (
      <>
        بگو چند تن می‌خواهی؛ قیمت هر کیلوگرم را برای همان تناژ بین کارخانه‌های موجود مقایسه می‌کند،
        ارزان‌ترین را مشخص می‌کند و می‌گوید نسبت به گزینهٔ بعدی چقدر صرفه دارد. مقایسه همیشه روی یک
        گرید مشخص انجام می‌شود، نه میانگین کل دسته.
      </>
    ),
  },
  {
    Icon: IBeamGlyph,
    title: 'وزن دقیق مقطع، نه تخمین سرانگشتی',
    body: (
      <>
        وزن هر شاخه و وزن کل را با فرمول استاندارد همان مقطع حساب می‌کند: میلگرد، تیرآهن، ناودانی،
        نبشی، ورق، لوله، قوطی، تسمه و مفتول. «۲۰ تن چند شاخه می‌شود؟» را هم جواب می‌دهد، با همان
        فرمولی که{' '}
        <Link href={routes.tool('weight')} className={styles.link}>
          وزن‌سنج
        </Link>{' '}
        سایت به کار می‌برد.
      </>
    ),
  },
  {
    Icon: InfoIcon,
    title: 'جواب فنی با منبع، نه حرف کلی',
    body: (
      <>
        برای سؤال‌هایی مثل فرق گریدهای میلگرد، در راهنماها و مقاله‌های منتشرشدهٔ آهن‌تایم می‌گردد و
        نام همان راهنما را به‌عنوان منبع می‌گوید. اگر راهنمایی برای موضوعی نداشته باشیم، صادقانه
        همین را می‌گوید.
      </>
    ),
  },
] as const;

export function AdvisorCapabilities() {
  return (
    <section className={styles.section} aria-labelledby="advisor-can-title">
      <h2 id="advisor-can-title" className={styles.title}>
        این مشاور چه کاری می‌کند که یک چت عمومی نمی‌کند؟
      </h2>
      <ul className={styles.list}>
        {CAPABILITIES.map(({ Icon, title, body }) => (
          <li key={title} className={styles.item}>
            <span className={styles.icon} aria-hidden="true">
              <Icon size={22} />
            </span>
            <div>
              <h3 className={styles.itemTitle}>{title}</h3>
              <p className={styles.itemText}>{body}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className={styles.footnote}>
        هر عددی که می‌گوید از همان دیتابیسی می‌آید که{' '}
        <Link href={routes.prices()} className={styles.link}>
          جدول‌های قیمت
        </Link>{' '}
        از آن ساخته می‌شوند. اگر قیمتی ثبت نشده باشد، عدد نمی‌سازد و می‌گوید کارشناس اعلام می‌کند.
      </p>
    </section>
  );
}

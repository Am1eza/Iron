import { AiMarkIcon, TagIcon, BankIcon, CalendarIcon } from '@/components/primitives/icons';
import { toPersianDigits } from '@/lib/utils/format';
import styles from './ValueProps.module.css';

/**
 * «خرید چطور کار می‌کند» — the B2B process strip. Replaces the old value-props
 * grid whose two featured tiles restated the hero (smart advisor, transparent
 * prices) one viewport after the hero demonstrated them. The four steps now
 * carry the page's genuinely NEW information — official proforma, بورس/LC
 * sourcing, scheduled delivery, human follow-through — as the buying journey
 * itself. Fully static (no client JS, no per-tile IntersectionObservers).
 */
const STEPS = [
  {
    Icon: AiMarkIcon,
    title: 'مشورت، رایگان',
    text: 'به مشاور هوشمند بگویید برای چه کاری می‌خواهید — مقدار، وزن و هزینهٔ پروژه بر پایهٔ قیمت‌های واقعی حساب می‌شود.',
  },
  {
    Icon: TagIcon,
    title: 'پیش‌فاکتور رسمی',
    text: 'سبد استعلام را ثبت کنید؛ پیش‌فاکتور با قیمت شفاف و مهلت اعتبار مشخص همان لحظه صادر و پیامک می‌شود.',
  },
  {
    Icon: BankIcon,
    title: 'تأمین مطمئن',
    text: 'تأمین رسمی از بورس کالا و کارخانه؛ برای خریدهای عمده، گشایش اعتبار اسنادی (LC) تا معاملهٔ بزرگ امن بماند.',
  },
  {
    // W22: was BellIcon — a bell on the homepage that had nothing to do with
    // price alerts (the real bell-worthy feature) just muddied that icon's
    // meaning everywhere else it's used for alerts.
    Icon: CalendarIcon,
    title: 'تحویل زمان‌بندی‌شده',
    text: 'زمان تحویل هر کالا از قبل اعلام می‌شود و کارشناس انسانی تا لحظهٔ تخلیهٔ بار کنار شماست.',
  },
] as const;

export function ValueProps() {
  return (
    <section className={styles.section} aria-labelledby="how-title">
      <div className="container">
        <div className={styles.head}>
          <p className={styles.eyebrow}>اول مشورت، بعد خرید</p>
          <h2 id="how-title" className={styles.title}>
            خرید در آهن‌تایم چطور کار می‌کند؟
          </h2>
        </div>

        <ol className={styles.steps}>
          {STEPS.map(({ Icon, title, text }, i) => (
            <li key={title} className={styles.step}>
              <span className={styles.stepIndex} aria-hidden="true">
                {toPersianDigits(i + 1)}
              </span>
              <span className={styles.stepIcon} aria-hidden="true">
                <Icon size={22} />
              </span>
              <h3 className={styles.stepTitle}>{title}</h3>
              <p className={styles.stepText}>{text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

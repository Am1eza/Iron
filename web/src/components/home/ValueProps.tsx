import { SparkIcon, TagIcon, BellIcon, UserIcon, BankIcon, ShieldIcon } from '@/components/primitives/icons';
import { Reveal } from '@/components/motion/Reveal';
import { toPersianDigits } from '@/lib/utils/format';
import styles from './ValueProps.module.css';

/**
 * «چرا آهن‌تایم» — asymmetric editorial grid: two featured tiles carry the core
 * promise (smart advisor, transparent prices); four compact rows carry the rest.
 * One layout family, used once on the page. Calm, no hype.
 */
const FEATURED = [
  {
    Icon: SparkIcon,
    title: 'مشاور هوشمند، نه فروشندهٔ پرحرف',
    text: 'آهن‌تایم متراژ پروژه‌ات را می‌فهمد و بر پایهٔ قیمت‌های واقعی راهنمایی می‌کند. بدون عدد ساختگی، بدون اصرار به خرید.',
  },
  {
    Icon: TagIcon,
    title: 'قیمت شفاف و لحظه‌ای',
    text: 'قیمت‌ها روزانه استعلام و به‌روز می‌شوند؛ نوسان و تاریخ هر قیمت پیش چشم توست و چیزی پشت تلفن پنهان نمی‌ماند.',
  },
] as const;

const COMPACT = [
  {
    Icon: BellIcon,
    title: 'زمان تحویل مشخص',
    text: 'برای هر کالا زمان تحویل اعلام می‌شود تا برنامهٔ پروژه بی‌وقفه پیش برود.',
  },
  {
    Icon: UserIcon,
    title: 'پشتیبانی انسانی و آگاه',
    text: 'درخواستت با همهٔ جزئیات به کارشناس می‌رسد؛ تماس، آگاهانه و سریع است.',
  },
  {
    Icon: BankIcon,
    title: 'خرید از بورس کالا',
    text: 'تأمین رسمی از بورس کالای ایران؛ فاکتور معتبر و اصالت تضمین‌شده.',
  },
  {
    Icon: ShieldIcon,
    title: 'گشایش LC برای مشتریان',
    text: 'برای خریدهای عمده اعتبار اسنادی باز می‌کنیم تا معاملهٔ بزرگ امن باشد.',
  },
] as const;

export function ValueProps() {
  return (
    <section className={styles.section} aria-labelledby="why-title">
      <div className="container">
        <div className={styles.head}>
          <p className={styles.eyebrow}>چرا آهن‌تایم</p>
          <h2 id="why-title" className={styles.title}>
            خرید آهن، مطمئن و شفاف
          </h2>
        </div>

        <div className={styles.grid}>
          {FEATURED.map(({ Icon, title, text }, i) => (
            <Reveal key={title} index={i} className={styles.featured}>
              <article className={styles.featuredCard}>
                <span className={styles.featuredIcon}>
                  <Icon size={26} />
                </span>
                <h3 className={styles.featuredTitle}>{title}</h3>
                <p className={styles.featuredText}>{text}</p>
                <span className={styles.featuredIndex} aria-hidden="true">
                  {toPersianDigits(String(i + 1).padStart(2, '0'))}
                </span>
              </article>
            </Reveal>
          ))}

          <div className={styles.compactCol}>
            {COMPACT.map(({ Icon, title, text }, i) => (
              <Reveal key={title} index={i + 2}>
                <article className={styles.row}>
                  <span className={styles.rowIcon}>
                    <Icon size={20} />
                  </span>
                  <div>
                    <h3 className={styles.rowTitle}>{title}</h3>
                    <p className={styles.rowText}>{text}</p>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

import { SparkIcon, TagIcon, BellIcon, UserIcon } from '@/components/primitives/icons';
import styles from './ValueProps.module.css';

/** «چرا آهن‌تایم» — the four trust pillars (vision/brand). Calm, no hype. */
const PILLARS = [
  {
    Icon: SparkIcon,
    accent: 'ai',
    title: 'مشاور هوشمند، نه فروشندهٔ پرحرف',
    text: 'آهن‌تایم متراژ پروژه‌ات را می‌فهمد و بر پایهٔ قیمت‌های واقعی راهنمایی می‌کند — بدون عدد ساختگی.',
  },
  {
    Icon: TagIcon,
    accent: 'action',
    title: 'قیمت شفاف و لحظه‌ای',
    text: 'قیمت‌ها روزانه استعلام و به‌روز می‌شوند؛ نوسان و تاریخ هر قیمت پیش چشم توست.',
  },
  {
    Icon: BellIcon,
    accent: 'ai',
    title: 'زمان تحویل مشخص',
    text: 'برای هر کالا زمان تحویل اعلام می‌شود تا برنامهٔ پروژه‌ات بی‌وقفه پیش برود.',
  },
  {
    Icon: UserIcon,
    accent: 'action',
    title: 'پشتیبانی انسانی و آگاه',
    text: 'درخواستت با همهٔ جزئیات به کارشناس می‌رسد؛ تماس، آگاهانه و سریع است.',
  },
] as const;

export function ValueProps() {
  return (
    <section className={styles.section} aria-labelledby="why-title">
      <div className="container">
      <div className={styles.head}>
        <p className={styles.eyebrow}>چرا آهن‌تایم</p>
        <h2 id="why-title" className={styles.title}>
          اول مشورت، بعد خرید.
        </h2>
        <p className={styles.sub}>
          خرید آهن‌آلات را از حدس و تماس‌های پراکنده به یک تصمیم روشن و مطمئن تبدیل می‌کنیم.
        </p>
      </div>

      <ul className={styles.grid}>
        {PILLARS.map(({ Icon, accent, title, text }) => (
          <li key={title} className={styles.card}>
            <span className={`${styles.icon} ${accent === 'ai' ? styles.accentAi : styles.accentAction}`}>
              <Icon size={22} />
            </span>
            <h3 className={styles.cardTitle}>{title}</h3>
            <p className={styles.cardText}>{text}</p>
          </li>
        ))}
      </ul>
      </div>
    </section>
  );
}

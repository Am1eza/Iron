import { ClientCarousel } from './ClientCarousel';
import styles from './Partners.module.css';

/**
 * Trust: the mills we source from + the clients who trust us. The supplier mills
 * stay a quiet name wall; the client section is an auto-advancing logo carousel
 * (ClientCarousel), driven by public/assets/logos/clients/index.ts.
 */
const FACTORIES = [
  'فولاد مبارکه',
  'ذوب‌آهن اصفهان',
  'فولاد خوزستان',
  'فولاد کاوه',
  'فولاد نیشابور',
  'فولاد ارفع',
  'نورد یزد',
  'فولاد کویر',
];

export function Partners() {
  return (
    <section className={styles.section} aria-labelledby="partners-title">
      <div className={`container ${styles.block}`}>
        <p className={styles.eyebrow}>تأمین مستقیم از کارخانه</p>
        <h2 id="partners-title" className={styles.title}>
          از معتبرترین کارخانه‌های فولاد ایران
        </h2>
        <ul className={styles.wall} aria-label="کارخانه‌های تأمین‌کننده">
          {FACTORIES.map((name) => (
            <li key={name} className={styles.logo}>
              {name}
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.block}>
        <div className="container">
          <p className={styles.eyebrow}>اعتماد مشتریان</p>
          <h2 className={styles.title}>کسانی که به آهن‌تایم اعتماد کرده‌اند</h2>
          <p className={styles.sub}>
            از سیمان و فولاد تا نفت، گاز و پتروشیمی — در کنار بزرگان صنعت ایران.
          </p>
        </div>
        <ClientCarousel />
      </div>
    </section>
  );
}

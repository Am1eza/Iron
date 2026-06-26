import styles from './Partners.module.css';

/**
 * Trust: the mills we source from + the customers who buy from us. Logo walls
 * (name-frames until real logo assets are supplied). Quiet, credible, mono.
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

const CUSTOMERS = [
  'گروه ساختمانی آرین',
  'پیمانکاری البرز',
  'عمران پارس',
  'مهندسی مهرگان',
  'سازه‌گستر نوین',
  'آبادگران شرق',
];

export function Partners() {
  return (
    <section className={styles.section} aria-labelledby="partners-title">
      <div className="container">
        <div className={styles.block}>
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
          <p className={styles.eyebrow}>اعتماد مشتریان</p>
          <h2 className={styles.title}>کسانی که به فولادنو اعتماد کرده‌اند</h2>
          <ul className={styles.wall} aria-label="مشتریان">
            {CUSTOMERS.map((name) => (
              <li key={name} className={`${styles.logo} ${styles.customer}`}>
                {name}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

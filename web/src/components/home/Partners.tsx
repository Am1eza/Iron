'use client';
import { useState } from 'react';
import { clientLogos, type ClientLogo } from '../../../public/assets/logos/clients';
import { Marquee } from './Marquee';
import styles from './Partners.module.css';

/**
 * Trust — the mills we source from + the clients who trust us. BOTH are smooth,
 * seamless marquees (shared Marquee component): a quiet mill name-strip and the
 * client logo strip. Consistent motion, no jump on «next».
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

function LogoCell({ c }: { c: ClientLogo }) {
  const [errored, setErrored] = useState(false);
  const showImg = c.hasLogo && !errored;
  return (
    <div className={styles.cell} title={c.name}>
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={c.file}
          alt={c.name}
          className={styles.logoImg}
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setErrored(true)}
        />
      ) : (
        <span className={styles.chip}>
          <span className={styles.mono} aria-hidden="true">{c.monogram}</span>
          <span className={styles.chipName}>{c.nameFa}</span>
        </span>
      )}
    </div>
  );
}

export function Partners() {
  return (
    <section className={styles.section} aria-labelledby="partners-title">
      <div className={styles.block}>
        <div className="container">
          <p className={styles.eyebrow}>تأمین مستقیم از کارخانه</p>
          <h2 id="partners-title" className={styles.title}>
            از معتبرترین کارخانه‌های فولاد ایران
          </h2>
        </div>
        <Marquee
          ariaLabel="کارخانه‌های تأمین‌کننده"
          speed={36}
          items={FACTORIES.map((name) => (
            <span key={name} className={styles.mill}>{name}</span>
          ))}
        />
      </div>

      <div className={styles.block}>
        <div className="container">
          <p className={styles.eyebrow}>اعتماد مشتریان</p>
          <h2 className={styles.title}>کسانی که به آهن‌تایم اعتماد کرده‌اند</h2>
          <p className={styles.sub}>
            از سیمان و فولاد تا نفت، گاز و پتروشیمی — در کنار بزرگان صنعت ایران.
          </p>
        </div>
        <Marquee
          ariaLabel="مشتریانی که به آهن‌تایم اعتماد کرده‌اند"
          speed={48}
          items={clientLogos.map((c) => (
            <LogoCell key={c.slug} c={c} />
          ))}
        />
      </div>
    </section>
  );
}

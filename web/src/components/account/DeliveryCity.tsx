'use client';
import { useTranslations, useLocale } from 'next-intl';
import { useProfileStore } from '@/lib/stores/profile';
import { CITIES, cityDistance, deliveryBucket, localizedCityName } from '@/lib/data/logistics';
import { localizeDigits } from '@/lib/utils/format';
import styles from './DeliveryCity.module.css';

/**
 * «شهر انبار من» — the buyer sets where their warehouse/site is; the factory
 * comparison then includes freight and delivery time from our Shadabad
 * warehouse to this city automatically.
 */
export function DeliveryCity() {
  const t = useTranslations('account.deliveryCity');
  const locale = useLocale();
  const city = useProfileStore((s) => s.warehouseCity);
  const setCity = useProfileStore((s) => s.setWarehouseCity);
  const km = cityDistance(city);

  return (
    <div className={styles.card}>
      <div className={styles.text}>
        <h3 className={styles.title}>{t('title')}</h3>
        <p className={styles.sub}>{t('sub', { origin: t('originLabel') })}</p>
      </div>
      <div className={styles.controls}>
        <select
          className={styles.select}
          value={city ?? ''}
          onChange={(e) => setCity(e.target.value || null)}
          aria-label={t('selectAriaLabel')}
        >
          <option value="">{t('selectPlaceholder')}</option>
          {CITIES.map((c) => (
            <option key={c.name} value={c.name}>
              {localizedCityName(c.name, locale)}
            </option>
          ))}
        </select>
        {city && km !== null && (
          <p className={styles.hint} role="status" aria-live="polite">
            {t('distanceHint', {
              km: localizeDigits(String(km), locale),
              delivery: t(`bucket.${deliveryBucket(km)}`),
            })}
          </p>
        )}
      </div>
    </div>
  );
}

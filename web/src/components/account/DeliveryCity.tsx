'use client';
import { useProfileStore } from '@/lib/stores/profile';
import { CITIES, ORIGIN_LABEL, cityDistance, deliveryLabel } from '@/lib/data/logistics';
import { toPersianDigits } from '@/lib/utils/format';
import styles from './DeliveryCity.module.css';

/**
 * «شهر انبار من» — the buyer sets where their warehouse/site is; the factory
 * comparison then includes freight and delivery time from our Shadabad
 * warehouse to this city automatically.
 */
export function DeliveryCity() {
  const city = useProfileStore((s) => s.warehouseCity);
  const setCity = useProfileStore((s) => s.setWarehouseCity);
  const km = cityDistance(city);

  return (
    <div className={styles.card}>
      <div className={styles.text}>
        <h3 className={styles.title}>شهر انبار من</h3>
        <p className={styles.sub}>
          مقصد تحویل سفارش‌ها؛ در «مقایسهٔ کارخانه‌ها» هزینهٔ حمل از {ORIGIN_LABEL} و زمان تحویل بر
          همین اساس محاسبه می‌شود.
        </p>
      </div>
      <div className={styles.controls}>
        <select
          className={styles.select}
          value={city ?? ''}
          onChange={(e) => setCity(e.target.value || null)}
          aria-label="شهر انبار"
        >
          <option value="">انتخاب کنید…</option>
          {CITIES.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
        {city && km !== null && (
          <p className={styles.hint} role="status" aria-live="polite">
            {toPersianDigits(km)} کیلومتر از انبار · تحویل {deliveryLabel(km)}
          </p>
        )}
      </div>
    </div>
  );
}

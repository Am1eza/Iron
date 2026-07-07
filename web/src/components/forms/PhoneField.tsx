'use client';
import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { phonePlaceholder, DEFAULT_PHONE_COUNTRY, type CountryCode } from '@/lib/utils/phone';
import { Field } from './fields';
import fieldStyles from './field.module.css';
import { CountrySelect } from './CountrySelect';
import styles from './PhoneField.module.css';

/**
 * International phone number input: a searchable country selector (flag + dial
 * code trigger, full names in a wide popup — see CountrySelect, which fixes the
 * old native-`<select>` name-overflow bug) beside an LTR national-number field.
 */
export function PhoneField({
  label,
  required,
  error,
  helper,
  country,
  onCountryChange,
  national,
  onNationalChange,
}: {
  label: string;
  required?: boolean;
  error?: string;
  helper?: string;
  country: CountryCode;
  onCountryChange: (country: CountryCode) => void;
  national: string;
  onNationalChange: (value: string) => void;
}) {
  const t = useTranslations('phone');
  const autoId = useId();
  const fid = `phone-${autoId}`;

  return (
    <Field label={label} htmlFor={fid} required={required} error={error} helper={helper}>
      <div className={styles.row} dir="ltr">
        <CountrySelect value={country} onChange={onCountryChange} ariaLabel={t('country')} />
        <input
          id={fid}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          required={required}
          className={`${fieldStyles.input} ${styles.nationalInput}`}
          placeholder={phonePlaceholder(country)}
          value={national}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${fid}-error` : helper ? `${fid}-help` : undefined}
          onChange={(e) => onNationalChange(e.target.value)}
        />
      </div>
    </Field>
  );
}

export { DEFAULT_PHONE_COUNTRY };

'use client';
import { useId, useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  listPhoneCountries,
  dialCode,
  phonePlaceholder,
  DEFAULT_PHONE_COUNTRY,
  type CountryCode,
} from '@/lib/utils/phone';
import type { AppLocale } from '@/i18n/config';
import { Field } from './fields';
import fieldStyles from './field.module.css';
import styles from './PhoneField.module.css';

/**
 * International phone number input: a country select (dial code + localized
 * country name, defaulting to Iran) beside a national-number field. Country
 * names come from `Intl.DisplayNames` keyed to the active UI locale — no
 * hand-maintained 240-country translation table to keep in sync across
 * fa/en/ar/zh, and it's correct by construction for any future locale too.
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
  const locale = useLocale() as AppLocale;
  const t = useTranslations('phone');
  const autoId = useId();
  const fid = `phone-${autoId}`;

  const countryNames = useMemo(() => {
    try {
      return new Intl.DisplayNames([locale], { type: 'region' });
    } catch {
      return null;
    }
  }, [locale]);

  const countries = useMemo(() => listPhoneCountries(), []);

  const countryLabel = (c: CountryCode) => {
    const name = countryNames?.of(c) ?? c;
    return `${dialCode(c)} ${name}`;
  };

  return (
    <Field label={label} htmlFor={fid} required={required} error={error} helper={helper}>
      <div className={styles.row} dir="ltr">
        <select
          className={`${fieldStyles.select} ${styles.countrySelect}`}
          aria-label={t('country')}
          value={country}
          onChange={(e) => onCountryChange(e.target.value as CountryCode)}
        >
          {countries.map((c) => (
            <option key={c} value={c}>
              {countryLabel(c)}
            </option>
          ))}
        </select>
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

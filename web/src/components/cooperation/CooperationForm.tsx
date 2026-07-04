'use client';
import { useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useToast } from '@/lib/hooks/useToast';
import { parsePhone, DEFAULT_PHONE_COUNTRY, type CountryCode } from '@/lib/utils/phone';
import { Button } from '@/components/ui';
import { PhoneField } from '@/components/forms/PhoneField';
import type { TrackKey } from './tracks';
import styles from './CooperationForm.module.css';

type Errors = { name?: string; mobile?: string };

/**
 * CooperationForm — the همکاری lead form. Collects name, mobile (any
 * country — this is a lead-capture form, not OTP, so international numbers
 * work today unlike login) and notes. No backend: on a valid submit it
 * shows a success toast and resets. Inline errors are announced via
 * aria-describedby + role.
 */
export function CooperationForm({ track }: { track: TrackKey }) {
  const t = useTranslations('cooperation');
  const tPhone = useTranslations('phone');
  const tAuth = useTranslations('auth');
  const toast = useToast();
  const baseId = useId();
  const [name, setName] = useState('');
  const [country, setCountry] = useState<CountryCode>(DEFAULT_PHONE_COUNTRY);
  const [national, setNational] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const nameRef = useRef<HTMLInputElement>(null);

  const nameId = `${baseId}-name`;
  const noteId = `${baseId}-note`;
  const nameErrId = `${baseId}-name-err`;

  const validate = (): Errors => {
    const next: Errors = {};
    if (name.trim().length < 2) next.name = t('nameError');
    if (!parsePhone(national, country)) next.mobile = tPhone('invalid');
    return next;
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) {
      if (next.name) nameRef.current?.focus();
      return;
    }

    // No backend — record the lead client-side only.
    toast.success(t('success'));
    setName('');
    setNational('');
    setCountry(DEFAULT_PHONE_COUNTRY);
    setNote('');
    setErrors({});
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate aria-label={t('formLabel')}>
      {/* Track is implicit from the page; carried for completeness. */}
      <input type="hidden" name="track" value={track} />

      <div className={styles.field}>
        <label className={styles.label} htmlFor={nameId}>
          {t('fullName')}
          <span className={styles.req} aria-hidden>
            *
          </span>
        </label>
        <input
          ref={nameRef}
          id={nameId}
          name="name"
          type="text"
          className={styles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          aria-required="true"
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? nameErrId : undefined}
          placeholder={t('fullNamePlaceholder')}
        />
        {errors.name ? (
          <p id={nameErrId} className={styles.error} role="alert">
            {errors.name}
          </p>
        ) : null}
      </div>

      <PhoneField
        label={tAuth('mobileLabel')}
        required
        error={errors.mobile}
        country={country}
        onCountryChange={setCountry}
        national={national}
        onNationalChange={(v) => {
          setNational(v);
          if (errors.mobile) setErrors((e) => ({ ...e, mobile: undefined }));
        }}
      />

      <div className={styles.field}>
        <label className={styles.label} htmlFor={noteId}>
          {t('notes')}
        </label>
        <textarea
          id={noteId}
          name="note"
          className={styles.textarea}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          placeholder={t('notesPlaceholder')}
        />
      </div>

      <Button type="submit" variant="primary" size="lg">
        {t('submit')}
      </Button>

      <p className={styles.consent}>{t('consent')}</p>
    </form>
  );
}

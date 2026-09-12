'use client';
import { useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useToast } from '@/lib/hooks/useToast';
import { parsePhone, DEFAULT_PHONE_COUNTRY, type CountryCode } from '@/lib/utils/phone';
import { cooperationApi } from '@/lib/api/resources/misc';
import { isApiError } from '@/lib/api/errors';
import { Button } from '@/components/ui';
import { PhoneField } from '@/components/forms/PhoneField';
import type { TrackKey } from './tracks';
import styles from './CooperationForm.module.css';

type Errors = { name?: string; mobile?: string };

/**
 * CooperationForm — the همکاری lead form. Collects name, mobile (any
 * country — this is a lead-capture form, not OTP, so international numbers
 * work today unlike login) and notes, and posts to `/api/cooperation`
 * (`cooperationApi.submit`), which turns it into a real CRM lead. The
 * `name` input fills the schema's `company` field — the same freeform
 * string either way, and adding a second "company name" field just to
 * satisfy a backend label would be friction with no product upside.
 * Inline errors are announced via aria-describedby + role.
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
  const [submitting, setSubmitting] = useState(false);
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

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) {
      if (next.name) nameRef.current?.focus();
      return;
    }
    const parsed = parsePhone(national, country);
    if (!parsed) return;

    setSubmitting(true);
    try {
      await cooperationApi.submit({
        track,
        company: name.trim(),
        mobile: parsed.normalized,
        message: note.trim() || undefined,
      });
      toast.success(t('success'));
      setName('');
      setNational('');
      setCountry(DEFAULT_PHONE_COUNTRY);
      setNote('');
      setErrors({});
    } catch (err) {
      toast.error(isApiError(err) ? err.message : tAuth('genericError'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate aria-label={t('formLabel')}>
      {/* Track drives the `track` field on the /api/cooperation payload above. */}
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

      <Button type="submit" variant="primary" size="lg" loading={submitting}>
        {t('submit')}
      </Button>

      <p className={styles.consent}>{t('consent')}</p>
    </form>
  );
}

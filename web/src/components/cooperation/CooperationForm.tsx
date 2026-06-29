'use client';
import { useId, useState } from 'react';
import { useToast } from '@/lib/hooks/useToast';
import { normalizeMobile } from '@/lib/utils/format';
import { Button } from '@/components/ui';
import type { TrackKey } from './tracks';
import styles from './CooperationForm.module.css';

type Errors = { name?: string; mobile?: string };

/**
 * CooperationForm — the همکاری lead form. Collects نام، شمارهٔ موبایل (validated with
 * normalizeMobile) and توضیحات. No backend: on a valid submit it shows a success
 * toast and resets. Inline errors are announced via aria-describedby + role.
 */
export function CooperationForm({ track }: { track: TrackKey }) {
  const toast = useToast();
  const baseId = useId();
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Errors>({});

  const nameId = `${baseId}-name`;
  const mobileId = `${baseId}-mobile`;
  const noteId = `${baseId}-note`;
  const nameErrId = `${baseId}-name-err`;
  const mobileErrId = `${baseId}-mobile-err`;

  const validate = (): Errors => {
    const next: Errors = {};
    if (name.trim().length < 2) next.name = 'نام خود را وارد کنید.';
    if (!normalizeMobile(mobile)) next.mobile = 'شمارهٔ موبایل معتبر نیست (مثال: ۰۹۱۲۳۴۵۶۷۸۹).';
    return next;
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    // No backend — record the lead client-side only.
    toast.success('درخواست شما ثبت شد؛ به‌زودی تماس می‌گیریم.');
    setName('');
    setMobile('');
    setNote('');
    setErrors({});
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate aria-label="فرم درخواست همکاری">
      {/* Track is implicit from the page; carried for completeness. */}
      <input type="hidden" name="track" value={track} />

      <div className={styles.field}>
        <label className={styles.label} htmlFor={nameId}>
          نام و نام خانوادگی
          <span className={styles.req} aria-hidden>
            *
          </span>
        </label>
        <input
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
          placeholder="مثلاً علی رضایی"
        />
        {errors.name ? (
          <p id={nameErrId} className={styles.error} role="alert">
            {errors.name}
          </p>
        ) : null}
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor={mobileId}>
          شمارهٔ موبایل
          <span className={styles.req} aria-hidden>
            *
          </span>
        </label>
        <input
          id={mobileId}
          name="mobile"
          type="tel"
          inputMode="numeric"
          dir="ltr"
          className={`${styles.input} ${styles.ltr} tnum`}
          value={mobile}
          onChange={(e) => setMobile(e.target.value)}
          autoComplete="tel"
          aria-required="true"
          aria-invalid={errors.mobile ? true : undefined}
          aria-describedby={errors.mobile ? mobileErrId : undefined}
          placeholder="09xxxxxxxxx"
        />
        {errors.mobile ? (
          <p id={mobileErrId} className={styles.error} role="alert">
            {errors.mobile}
          </p>
        ) : null}
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor={noteId}>
          توضیحات
        </label>
        <textarea
          id={noteId}
          name="note"
          className={styles.textarea}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          placeholder="درخواست یا توضیح خود را اینجا بنویسید…"
        />
      </div>

      <Button type="submit" variant="primary" size="lg">
        ثبت درخواست همکاری
      </Button>

      <p className={styles.consent}>
        با ثبت درخواست، با تماس کارشناسان آهن‌تایم برای پیگیری همین موضوع موافقت می‌کنید.
      </p>
    </form>
  );
}

'use client';
import { routes } from '@/lib/routes';
import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { formsApi } from '@/lib/api/forms';
import { isApiError } from '@/lib/api/errors';
// The post-verify name step (see the `step` docblock) is the one call here
// that formsApi does not proxy — it is a profile update, not a form submit.
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/stores/auth';
import { canAccessAdmin } from '@/lib/auth/roles';
import { normalizeDigits, localizeDigits } from '@/lib/utils/format';
import { CONSTANTS } from '@/lib/config/constants';
import { parsePhone, DEFAULT_PHONE_COUNTRY, type CountryCode } from '@/lib/utils/phone';
import type { AppLocale } from '@/i18n/config';
import { TextInput } from './fields';
import { PhoneField } from './PhoneField';
import { OtpInput, type OtpInputHandle } from './OtpInput';
import { FormStatus } from './FormStatus';
import { Button } from '@/components/primitives/Button';
import { safeNextPath } from '@/lib/routes';
import { Badge, Alert } from '@/components/ui';
import styles from './LoginForm.module.css';

/** `chromeless` — render just the form, no card frame or heading: the panel
 *  login page (app/panel-login) supplies its own stage, title and framing. */
export function LoginForm({ chromeless = false }: { chromeless?: boolean } = {}) {
  const router = useRouter();
  // Sanitize at the consumer, not just the producer: middleware and
  // /api/auth/silent both write a same-site path here, but nothing stopped a
  // hand-crafted /login?next=https://evil.com. router.push() performs a real
  // cross-origin navigation for an absolute URL, so the victim would complete
  // a genuine OTP login on the real domain and land on an attacker's clone.
  const next = safeNextPath(useSearchParams().get('next'));
  // The cart's own CTA now says «ورود و ادامه ثبت درخواست» so the login
  // requirement isn't a surprise, but arriving here still drops the visitor
  // on a bare phone-number form with no link back to what they were doing.
  // This is the one thing worth saying twice.
  const fromRequestFlow = next === routes.request();
  const setUser = useAuthStore((s) => s.setUser);
  const t = useTranslations('auth');
  const tPhone = useTranslations('phone');
  const locale = useLocale() as AppLocale;

  /**
   * `name` is a POST-verification step (W29). The form used to know, before
   * the code was even sent, whether this number was a new account — the OTP
   * request response carried `isNewUser`. That answer is exactly what user
   * enumeration wants, and it was free to anyone. The same UX (returning users
   * are never asked to re-type their name) now comes from the VERIFY
   * response's `isNew`, which costs a correct one-time code: the account is
   * created, the session is live, and only then does a genuinely new user get
   * asked who they are.
   */
  const [step, setStep] = useState<'mobile' | 'code' | 'name'>('mobile');
  const [country, setCountry] = useState<CountryCode>(DEFAULT_PHONE_COUNTRY);
  const [national, setNational] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [mobileError, setMobileError] = useState<string | undefined>(undefined);
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [mobile, setMobile] = useState(''); // normalized value once sent
  const [code, setCode] = useState('');
  const [otpError, setOtpError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [devCode, setDevCode] = useState<string | null>(null);
  const otpRef = useRef<OtpInputHandle>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  useEffect(() => {
    if (step === 'code') otpRef.current?.focus();
  }, [step]);

  const sendOtp = async (m: string) => {
    setError(null);
    try {
      const res = await formsApi.requestOtp(m);
      setMobile(m);
      setStep('code');
      setResendIn(60);
      setDevCode(res.devCode ?? null);
    } catch (e) {
      setError(isApiError(e) ? e.message : t('genericError'));
    }
  };

  const handleMobileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parsePhone(national, country);
    if (!parsed) {
      setMobileError(tPhone('invalid'));
      return;
    }
    setMobileError(undefined);
    setSubmitting(true);
    await sendOtp(parsed.normalized);
    setSubmitting(false);
  };

  const verify = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setOtpError(false);
    setError(null);
    if (normalizeDigits(code).length !== CONSTANTS.OTP_LENGTH) {
      setOtpError(true);
      otpRef.current?.focus();
      return;
    }
    setNameError(undefined);
    setVerifying(true);
    try {
      const { user, isNew } = await formsApi.verifyOtp(mobile, code, {
        inviteCode: inviteCode.trim() || undefined,
      });
      setUser(user);
      // A genuinely new account, and the server had no name to give it. The
      // session is already live at this point, so this step is a completion
      // prompt, not a gate: abandoning it leaves a working (nameless) account
      // the user can finish from /account, rather than a failed login.
      if (isNew && !user.name?.trim()) {
        setStep('name');
        return;
      }
      finishLogin(user.role);
    } catch (e) {
      setOtpError(true);
      setError(isApiError(e) ? e.message : t('wrongCode'));
      otpRef.current?.focus();
    } finally {
      setVerifying(false);
    }
  };

  /** Post-registration name capture (see the `step` docblock). */
  const submitName = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);
    if (!firstName.trim() || !lastName.trim()) {
      setNameError(t('nameHelper'));
      return;
    }
    setNameError(undefined);
    setVerifying(true);
    try {
      const { user } = await api.auth.updateProfile(firstName.trim(), lastName.trim());
      setUser(user);
      finishLogin(user.role);
    } catch (e) {
      setError(isApiError(e) ? e.message : t('genericError'));
    } finally {
      setVerifying(false);
    }
  };

  function finishLogin(role: Parameters<typeof canAccessAdmin>[0]) {
    // The admin panel exists ONLY on panel.ahantime.com — on the public
    // site a staff member is deliberately a normal user (owner decision),
    // so staff land on their account like everyone else. On the panel host,
    // '/' is the dashboard (host rewrite); a NON-staff login there has no
    // usable destination on that host at all, so send them to their account
    // on the public site (their session cookie is host-scoped — they'll
    // sign in there like a normal visitor).
    const onPanelHost = typeof window !== 'undefined' && window.location.hostname === 'panel.ahantime.com';
    if (onPanelHost && !canAccessAdmin(role)) {
      window.location.href = `https://ahantime.com${routes.account()}`;
      return;
    }
    router.push(next ?? (onPanelHost ? '/' : routes.account()));
    router.refresh();
  }

  return (
    <div className={chromeless ? styles.bare : styles.card}>
      {chromeless ? (
        // The page owns the H1; the form only announces the step change.
        step === 'mobile' ? null : (
          <p className={styles.subtitle} style={{ textAlign: 'center', margin: 0 }} role="status">
            {step === 'name'
              ? t('registerNameSubtitle')
              : t('codeSentTo', { mobile: localizeDigits(mobile, locale) })}
          </p>
        )
      ) : (
        <div className={styles.head}>
          <h1 className={styles.title}>
            {step === 'mobile' ? t('title') : step === 'name' ? t('registerTitle') : t('verifyTitle')}
            {step === 'name' ? (
              <Badge tone="accent" className={styles.newUserBadge}>
                {t('newUserBadge')}
              </Badge>
            ) : null}
          </h1>
          <p className={styles.subtitle}>
            {step === 'mobile'
              ? t('subtitle')
              : step === 'name'
                ? t('registerNameSubtitle')
                : t('codeSentTo', { mobile: localizeDigits(mobile, locale) })}
          </p>
        </div>
      )}

      {fromRequestFlow ? <Alert tone="info">{t('requestFlowNote')}</Alert> : null}

      {error || (step === 'code' && otpError) ? (
        <FormStatus variant="error" id={step === 'code' ? 'otp-error' : undefined}>
          {error ?? 'کد تأیید باید ۶ رقم باشد.'}
        </FormStatus>
      ) : null}

      {step === 'mobile' ? (
        <form className={styles.form} onSubmit={handleMobileSubmit} noValidate>
          <PhoneField
            label={t('mobileLabel')}
            required
            helper={t('mobileHelper')}
            error={mobileError}
            country={country}
            onCountryChange={setCountry}
            national={national}
            onNationalChange={(v) => {
              setNational(v);
              if (mobileError) setMobileError(undefined);
            }}
          />
          <Button type="submit" fullWidth loading={submitting}>
            {t('getCode')}
          </Button>
        </form>
      ) : step === 'name' ? (
        // Also a <form> — Enter from either name field must finish
        // registration, same reasoning as the code step below.
        <form className={styles.form} onSubmit={submitName} noValidate>
          <div className={styles.nameRow}>
            <TextInput
              label={t('firstNameLabel')}
              type="text"
              required
              autoComplete="given-name"
              error={nameError}
              value={firstName}
              onChange={(e) => {
                setFirstName(e.target.value);
                if (nameError) setNameError(undefined);
              }}
            />
            <TextInput
              label={t('lastNameLabel')}
              type="text"
              required
              autoComplete="family-name"
              value={lastName}
              onChange={(e) => {
                setLastName(e.target.value);
                if (nameError) setNameError(undefined);
              }}
            />
          </div>
          <Button type="submit" fullWidth loading={verifying}>
            {t('completeRegistration')}
          </Button>
        </form>
      ) : (
        // A <form>, not a <div>. The code step used to be a plain div with an
        // onClick button, so pressing Enter after typing the last OTP digit
        // did nothing — the single most natural way to finish an OTP, and the
        // one a keyboard-only or screen-reader user reaches for first (WCAG
        // 3.2.2 On Input / 2.1.1 Keyboard, and plain broken-feeling UX for
        // everyone else). Native implicit submission now handles it.
        <form className={styles.form} onSubmit={verify} noValidate>
          {devCode ? (
            <p className={styles.devCode} role="status">
              {t('devCode', { code: localizeDigits(devCode, locale) })}
            </p>
          ) : null}
          <OtpInput ref={otpRef} value={code} onChange={setCode} error={otpError} label={t('otpLabel')} />
          {/* Optional for everyone, and shown to everyone: it applies only if
              this code creates an account, and — unlike the name fields it
              used to sit beside — it discloses nothing about the number. */}
          <TextInput
            label={t('inviteCodeLabel')}
            type="text"
            autoComplete="off"
            helper={t('inviteCodeHelper')}
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
          />
          <p className={styles.hint}>{t('deliveryHint')}</p>
          <Button type="submit" fullWidth loading={verifying}>
            {t('verifyAndLogin')}
          </Button>
          <div className={styles.actions}>
            <button type="button" className={styles.linkBtn} onClick={() => setStep('mobile')}>
              {t('changeNumber')}
            </button>
            <button
              type="button"
              className={styles.linkBtn}
              disabled={resendIn > 0}
              data-muted={resendIn > 0 ? '' : undefined}
              onClick={() => sendOtp(mobile)}
            >
              {resendIn > 0
                ? t('resendIn', { seconds: localizeDigits(resendIn, locale) })
                : t('resendCode')}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

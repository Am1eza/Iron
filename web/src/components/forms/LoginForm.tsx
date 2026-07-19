'use client';
import { routes } from '@/lib/routes';
import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { formsApi } from '@/lib/api/forms';
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
import { Badge } from '@/components/ui';
import styles from './LoginForm.module.css';

export function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get('next');
  const setUser = useAuthStore((s) => s.setUser);
  const t = useTranslations('auth');
  const tPhone = useTranslations('phone');
  const locale = useLocale() as AppLocale;

  const [step, setStep] = useState<'mobile' | 'code'>('mobile');
  const [country, setCountry] = useState<CountryCode>(DEFAULT_PHONE_COUNTRY);
  const [national, setNational] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [mobileError, setMobileError] = useState<string | undefined>(undefined);
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [mobile, setMobile] = useState(''); // normalized value once sent
  // Known only once the OTP is actually requested — an existing account
  // never needs (and previously was wrongly forced to re-enter) a name;
  // verifyOtp on the server ignores reg.firstName/lastName for it anyway.
  const [isNewUser, setIsNewUser] = useState(false);
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
      setIsNewUser(res.isNewUser);
      setStep('code');
      setResendIn(60);
      setDevCode(res.devCode ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('genericError'));
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

  const verify = async () => {
    setOtpError(false);
    setError(null);
    if (normalizeDigits(code).length !== CONSTANTS.OTP_LENGTH) {
      setOtpError(true);
      otpRef.current?.focus();
      return;
    }
    // Name is only meaningful (and only asked for) on a genuinely new
    // account — an existing user skips straight past this.
    if (isNewUser && (!firstName.trim() || !lastName.trim())) {
      setNameError(t('nameHelper'));
      return;
    }
    setNameError(undefined);
    setVerifying(true);
    try {
      const { user } = await formsApi.verifyOtp(mobile, code, {
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        inviteCode: inviteCode.trim() || undefined,
      });
      setUser(user);
      router.push(next ?? (canAccessAdmin(user.role) ? routes.admin.dashboard() : routes.account()));
      router.refresh();
    } catch (e) {
      setOtpError(true);
      setError(e instanceof Error ? e.message : t('wrongCode'));
      otpRef.current?.focus();
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <h1 className={styles.title}>
          {step === 'mobile' ? t('title') : isNewUser ? t('registerTitle') : t('verifyTitle')}
          {step === 'code' && isNewUser ? (
            <Badge tone="accent" className={styles.newUserBadge}>
              {t('newUserBadge')}
            </Badge>
          ) : null}
        </h1>
        <p className={styles.subtitle}>
          {step === 'mobile'
            ? t('subtitle')
            : isNewUser
              ? t('registerSubtitle', { mobile: localizeDigits(mobile, locale) })
              : t('codeSentTo', { mobile: localizeDigits(mobile, locale) })}
        </p>
      </div>

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
      ) : (
        <div className={styles.form}>
          {devCode ? (
            <p className={styles.devCode} role="status">
              {t('devCode', { code: localizeDigits(devCode, locale) })}
            </p>
          ) : null}
          <OtpInput ref={otpRef} value={code} onChange={setCode} error={otpError} label={t('otpLabel')} />
          {isNewUser ? (
            <>
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
              <TextInput
                label={t('inviteCodeLabel')}
                type="text"
                autoComplete="off"
                helper={t('inviteCodeHelper')}
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              />
            </>
          ) : null}
          <p className={styles.hint}>{t('deliveryHint')}</p>
          <Button onClick={verify} fullWidth loading={verifying}>
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
        </div>
      )}
    </div>
  );
}

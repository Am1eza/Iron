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
  const [name, setName] = useState('');
  const [mobileError, setMobileError] = useState<string | undefined>(undefined);
  const [mobile, setMobile] = useState(''); // normalized value once sent
  const [code, setCode] = useState('');
  const [otpError, setOtpError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [regName, setRegName] = useState<string | undefined>(undefined);
  const otpRef = useRef<OtpInputHandle>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  // Move focus to the first OTP box whenever the step changes to 'code' so
  // screen reader users land on the field they need to fill next.
  useEffect(() => {
    if (step === 'code') otpRef.current?.focus();
  }, [step]);

  const sendOtp = async (m: string, submittedName?: string) => {
    setError(null);
    try {
      const cleanName = submittedName?.trim() || regName;
      const res = await formsApi.requestOtp(m, cleanName);
      setMobile(m);
      setRegName(cleanName);
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
    await sendOtp(parsed.normalized, name);
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
    setVerifying(true);
    try {
      const { user } = await formsApi.verifyOtp(mobile, code);
      setUser(user);
      // Staff roles land in the admin panel, not the customer account page —
      // unless a specific `next` was already requested (e.g. a staff member
      // deep-linked to a particular /admin/* page before being sent to login).
      router.push(next ?? (canAccessAdmin(user.role) ? routes.admin.dashboard() : routes.account()));
      router.refresh(); // let server components re-read the new session cookie
    } catch (e) {
      setOtpError(true);
      setError(e instanceof Error ? e.message : t('wrongCode'));
      otpRef.current?.focus();
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="stack" style={{ maxInlineSize: 360 }}>
      {error || (step === 'code' && otpError) ? (
        <FormStatus variant="error" id={step === 'code' ? 'otp-error' : undefined}>
          {error ?? 'کد تأیید باید ۶ رقم باشد.'}
        </FormStatus>
      ) : null}

      {step === 'mobile' ? (
        <form onSubmit={handleMobileSubmit} noValidate>
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
          <TextInput
            label={t('nameLabel')}
            type="text"
            autoComplete="name"
            helper={t('nameHelper')}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" fullWidth loading={submitting}>
            {t('getCode')}
          </Button>
        </form>
      ) : (
        <div className="stack">
          <p
            role="status"
            style={{ font: 'var(--t-body-sm)', color: 'var(--color-text-muted)' }}
          >
            {t('codeSentTo', { mobile: localizeDigits(mobile, locale) })}
          </p>
          {devCode ? (
            <p
              style={{ font: 'var(--t-caption)', color: 'var(--color-action-text)' }}
              role="status"
            >
              {t('devCode', { code: localizeDigits(devCode, locale) })}
            </p>
          ) : null}
          <OtpInput ref={otpRef} value={code} onChange={setCode} error={otpError} label={t('otpLabel')} />
          <Button onClick={verify} fullWidth loading={verifying}>
            {t('verifyAndLogin')}
          </Button>
          <div className="cluster" style={{ justifyContent: 'space-between' }}>
            <button
              type="button"
              onClick={() => setStep('mobile')}
              style={{ background: 'none', border: 0, color: 'var(--color-accent-text)', cursor: 'pointer' }}
            >
              {t('changeNumber')}
            </button>
            <button
              type="button"
              disabled={resendIn > 0}
              onClick={() => sendOtp(mobile)}
              style={{
                background: 'none',
                border: 0,
                color: resendIn > 0 ? 'var(--color-text-muted)' : 'var(--color-accent-text)',
                cursor: resendIn > 0 ? 'default' : 'pointer',
              }}
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

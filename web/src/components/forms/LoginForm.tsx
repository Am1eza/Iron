'use client';
import { routes } from '@/lib/routes';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter, useSearchParams } from 'next/navigation';
import { loginMobileSchema, type LoginMobileValues } from '@/lib/validation/schemas';
import { formsApi } from '@/lib/api/forms';
import { useAuthStore } from '@/lib/stores/auth';
import { normalizeDigits, toPersianDigits } from '@/lib/utils/format';
import { TextInput } from './fields';
import { OtpInput } from './OtpInput';
import { FormStatus } from './FormStatus';
import { Button } from '@/components/primitives/Button';

export function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get('next');
  const setUser = useAuthStore((s) => s.setUser);

  const [step, setStep] = useState<'mobile' | 'code'>('mobile');
  const [mobile, setMobile] = useState('');
  const [code, setCode] = useState('');
  const [otpError, setOtpError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [regName, setRegName] = useState<string | undefined>(undefined);

  const { register, handleSubmit, formState } = useForm<LoginMobileValues>({
    resolver: zodResolver(loginMobileSchema),
  });

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const sendOtp = async (m: string, name?: string) => {
    setError(null);
    try {
      const cleanName = name?.trim() || regName;
      const res = await formsApi.requestOtp(m, cleanName);
      setMobile(m);
      setRegName(cleanName);
      setStep('code');
      setResendIn(60);
      setDevCode(res.devCode ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطایی رخ داد.');
    }
  };

  const verify = async () => {
    setOtpError(false);
    setError(null);
    if (normalizeDigits(code).length !== 5) {
      setOtpError(true);
      return;
    }
    setVerifying(true);
    try {
      const { user } = await formsApi.verifyOtp(mobile, code);
      setUser(user);
      router.push(next ?? routes.account());
      router.refresh(); // let server components re-read the new session cookie
    } catch (e) {
      setOtpError(true);
      setError(e instanceof Error ? e.message : 'کد اشتباه است.');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="stack" style={{ maxInlineSize: 360 }}>
      {error ? <FormStatus variant="error">{error}</FormStatus> : null}

      {step === 'mobile' ? (
        <form onSubmit={handleSubmit((v) => sendOtp(v.mobile, v.name))} noValidate>
          <TextInput
            label="شمارهٔ موبایل"
            type="tel"
            inputMode="numeric"
            placeholder="۰۹۱۲۳۴۵۶۷۸۹"
            autoComplete="tel"
            helper="کد تأیید برای همین شماره پیامک می‌شود."
            error={formState.errors.mobile?.message}
            {...register('mobile')}
          />
          <TextInput
            label="نام (اختیاری)"
            type="text"
            autoComplete="name"
            helper="اگر اولین ورود شماست، نامتان را وارد کنید."
            error={formState.errors.name?.message}
            {...register('name')}
          />
          <Button type="submit" fullWidth loading={formState.isSubmitting}>
            دریافت کد تأیید
          </Button>
        </form>
      ) : (
        <div className="stack">
          <p style={{ font: 'var(--t-body-sm)', color: 'var(--color-text-muted)' }}>
            کد ۵ رقمی برای {toPersianDigits(mobile)} پیامک شد.
          </p>
          {devCode ? (
            <p
              style={{ font: 'var(--t-caption)', color: 'var(--color-action-text)' }}
              role="status"
            >
              کد آزمایشی (محیط توسعه): {toPersianDigits(devCode)}
            </p>
          ) : null}
          <OtpInput value={code} onChange={setCode} error={otpError} />
          <Button onClick={verify} fullWidth loading={verifying}>
            تأیید و ورود
          </Button>
          <div className="cluster" style={{ justifyContent: 'space-between' }}>
            <button
              type="button"
              onClick={() => setStep('mobile')}
              style={{ background: 'none', border: 0, color: 'var(--color-accent-text)', cursor: 'pointer' }}
            >
              تغییر شماره
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
              {resendIn > 0 ? `ارسال مجدد تا ${toPersianDigits(resendIn)} ثانیه` : 'ارسال مجدد کد'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

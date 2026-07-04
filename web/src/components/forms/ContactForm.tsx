'use client';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { contactSchema, type ContactValues } from '@/lib/validation/schemas';
import { formsApi } from '@/lib/api/forms';
import { parsePhone, DEFAULT_PHONE_COUNTRY, type CountryCode } from '@/lib/utils/phone';
import { TextInput, Textarea } from './fields';
import { PhoneField } from './PhoneField';
import { FormStatus } from './FormStatus';
import { Button } from '@/components/primitives/Button';

export function ContactForm() {
  const t = useTranslations('auth');
  const tContact = useTranslations('contact');
  const tCommon = useTranslations('common');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [country, setCountry] = useState<CountryCode>(DEFAULT_PHONE_COUNTRY);
  const [national, setNational] = useState('');
  const { register, handleSubmit, reset, setValue, formState } = useForm<ContactValues>({
    resolver: zodResolver(contactSchema),
  });

  // Keep RHF's registered `mobile` value in sync with the PhoneField's
  // country + national-number state — see LoginForm's PhoneField usage for
  // the same pattern without react-hook-form.
  useEffect(() => {
    const parsed = parsePhone(national, country);
    setValue('mobile', parsed?.normalized ?? '', { shouldValidate: formState.isSubmitted });
  }, [country, national, setValue, formState.isSubmitted]);

  const onSubmit = async (values: ContactValues) => {
    setError(null);
    try {
      await formsApi.submitContact(values);
      setDone(true);
      reset();
      setNational('');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('genericError'));
    }
  };

  if (done) return <FormStatus variant="success">{tContact('success')}</FormStatus>;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate style={{ maxInlineSize: 480 }}>
      {error ? <FormStatus variant="error">{error}</FormStatus> : null}
      <TextInput
        label={tCommon('nameLabel')}
        required
        autoComplete="name"
        error={formState.errors.name?.message}
        {...register('name')}
      />
      <input type="hidden" {...register('mobile')} />
      <PhoneField
        label={t('mobileLabel')}
        required
        error={formState.errors.mobile?.message}
        country={country}
        onCountryChange={setCountry}
        national={national}
        onNationalChange={setNational}
      />
      <Textarea
        label={tContact('messageLabel')}
        required
        error={formState.errors.message?.message}
        {...register('message')}
      />
      <Button type="submit" loading={formState.isSubmitting}>
        {tContact('send')}
      </Button>
    </form>
  );
}

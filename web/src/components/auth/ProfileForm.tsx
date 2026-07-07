'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations, useLocale } from 'next-intl';
import { profileSchema, type ProfileValues } from '@/lib/validation/schemas';
import { api } from '@/lib/api';
import { isApiError } from '@/lib/api/errors';
import { useAuthStore } from '@/lib/stores/auth';
import { useToast } from '@/lib/hooks/useToast';
import { localizeDigits } from '@/lib/utils/format';
import type { AppLocale } from '@/i18n/config';
import { TextInput } from '@/components/forms/fields';
import { Button } from '@/components/primitives/Button';

/** User profile editor (item 59) — updates the display name; mobile is read-only. */
export function ProfileForm() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const toast = useToast();
  const t = useTranslations('profile');
  const tAuth = useTranslations('auth');
  const locale = useLocale() as AppLocale;

  const { register, handleSubmit, formState, setError } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: user?.firstName ?? '',
      lastName: user?.lastName ?? '',
    },
  });

  const onSubmit = async (values: ProfileValues) => {
    try {
      const { user: updated } = await api.auth.updateProfile(values.firstName, values.lastName);
      setUser({ ...(user ?? updated), ...updated });
      toast.success(t('updated'));
    } catch (e) {
      if (isApiError(e) && e.fields?.firstName) {
        setError('firstName', { message: e.fields.firstName[0] });
      } else {
        toast.error(e instanceof Error ? e.message : t('updateFailed'));
      }
    }
  };

  return (
    <form className="stack" style={{ maxInlineSize: 420 }} onSubmit={handleSubmit(onSubmit)} noValidate>
      <TextInput
        id="profile-mobile"
        name="mobile"
        label={tAuth('mobileLabel')}
        value={user ? localizeDigits(user.mobile, locale) : ''}
        readOnly
        disabled
        dir="ltr"
      />
      <div className="cluster" style={{ gap: 'var(--space-3)' }}>
        <div style={{ flex: 1, minInlineSize: 0 }}>
          <TextInput
            label={tAuth('firstNameLabel')}
            autoComplete="given-name"
            error={formState.errors.firstName?.message}
            {...register('firstName')}
          />
        </div>
        <div style={{ flex: 1, minInlineSize: 0 }}>
          <TextInput
            label={tAuth('lastNameLabel')}
            autoComplete="family-name"
            error={formState.errors.lastName?.message}
            {...register('lastName')}
          />
        </div>
      </div>
      <Button type="submit" loading={formState.isSubmitting}>
        {t('saveChanges')}
      </Button>
    </form>
  );
}

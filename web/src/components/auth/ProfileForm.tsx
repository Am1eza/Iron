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
  const tCommon = useTranslations('common');
  const locale = useLocale() as AppLocale;

  const { register, handleSubmit, formState, setError } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user?.name ?? '' },
  });

  const onSubmit = async (values: ProfileValues) => {
    try {
      const { user: updated } = await api.auth.updateProfile(values.name);
      setUser({ ...(user ?? updated), ...updated });
      toast.success(t('updated'));
    } catch (e) {
      if (isApiError(e) && e.fields?.name) {
        setError('name', { message: e.fields.name[0] });
      } else {
        toast.error(e instanceof Error ? e.message : t('updateFailed'));
      }
    }
  };

  return (
    <form className="stack" style={{ maxInlineSize: 360 }} onSubmit={handleSubmit(onSubmit)} noValidate>
      <TextInput
        id="profile-mobile"
        name="mobile"
        label={tAuth('mobileLabel')}
        value={user ? localizeDigits(user.mobile, locale) : ''}
        readOnly
        disabled
        dir="ltr"
      />
      <TextInput
        label={tCommon('nameLabel')}
        autoComplete="name"
        error={formState.errors.name?.message}
        {...register('name')}
      />
      <Button type="submit" loading={formState.isSubmitting}>
        {t('saveChanges')}
      </Button>
    </form>
  );
}

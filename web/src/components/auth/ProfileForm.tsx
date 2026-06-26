'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { profileSchema, type ProfileValues } from '@/lib/validation/schemas';
import { api } from '@/lib/api';
import { isApiError } from '@/lib/api/errors';
import { useAuthStore } from '@/lib/stores/auth';
import { useToast } from '@/lib/hooks/useToast';
import { toPersianDigits } from '@/lib/utils/format';
import { TextInput } from '@/components/forms/fields';
import { Button } from '@/components/primitives/Button';

/** User profile editor (item 59) — updates the display name; mobile is read-only. */
export function ProfileForm() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const toast = useToast();

  const { register, handleSubmit, formState, setError } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user?.name ?? '' },
  });

  const onSubmit = async (values: ProfileValues) => {
    try {
      const { user: updated } = await api.auth.updateProfile(values.name);
      setUser({ ...(user ?? updated), ...updated });
      toast.success('پروفایل به‌روزرسانی شد.');
    } catch (e) {
      if (isApiError(e) && e.fields?.name) {
        setError('name', { message: e.fields.name[0] });
      } else {
        toast.error(e instanceof Error ? e.message : 'به‌روزرسانی ناموفق بود.');
      }
    }
  };

  return (
    <form className="stack" style={{ maxInlineSize: 360 }} onSubmit={handleSubmit(onSubmit)} noValidate>
      <TextInput
        label="شمارهٔ موبایل"
        value={user ? toPersianDigits(user.mobile) : ''}
        readOnly
        disabled
        dir="ltr"
      />
      <TextInput
        label="نام"
        autoComplete="name"
        error={formState.errors.name?.message}
        {...register('name')}
      />
      <Button type="submit" loading={formState.isSubmitting}>
        ذخیرهٔ تغییرات
      </Button>
    </form>
  );
}

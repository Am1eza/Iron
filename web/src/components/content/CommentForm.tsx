'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/hooks/useAuth';
import { useToast } from '@/lib/hooks/useToast';
import { api } from '@/lib/api';
import { ApiError } from '@/lib/api/errors';
import { Button, Text } from '@/components/ui';
import { Textarea } from '@/components/forms/fields';
import styles from './ArticleComments.module.css';

const MAX_LEN = 1000;

/**
 * The submit half of `ArticleComments` (US-14.8) — a client component
 * because it needs the signed-in state and an actual fetch, unlike the
 * (server-rendered) approved list beside it.
 *
 * Login-gated, not anonymous: a customer with no session sees a single
 * "برای ثبت نظر وارد شوید" link, not a form that would 401 on submit.
 * Submitting never adds the comment to the list on screen — it is
 * `pending` until an admin approves it (see `commentsRepo.ts`), so
 * pretending it appeared would be lying about what just happened.
 */
export function CommentForm({ slug }: { slug: string }) {
  const { isAuthenticated, isLoading } = useAuth();
  const toast = useToast();
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (isLoading) return null;

  if (!isAuthenticated) {
    return (
      <Text color="muted">
        برای ثبت نظر، <Link href="/login">وارد شوید</Link>.
      </Text>
    );
  }

  const submit = async () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      await api.comments.create(slug, trimmed);
      setBody('');
      toast.success('نظر شما ثبت شد؛ پس از بررسی، نمایش داده می‌شود.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'ثبت نظر ناموفق بود؛ دوباره تلاش کنید.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.form}>
      <Textarea
        label="نظر شما"
        value={body}
        maxLength={MAX_LEN}
        rows={3}
        placeholder="نظر یا تجربهٔ خود را دربارهٔ این مطلب بنویسید…"
        onChange={(e) => setBody(e.target.value)}
      />
      <Button type="button" size="sm" disabled={submitting || body.trim().length === 0} onClick={() => void submit()}>
        {submitting ? 'در حال ارسال…' : 'ثبت نظر'}
      </Button>
    </div>
  );
}

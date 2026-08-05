'use client';
/**
 * Connect / disconnect Google Search Console (US-14.4) — lives on /admin/seo
 * next to the redirects manager.
 *
 * ── WHY THIS PANEL EXPLAINS ITSELF AT LENGTH ─────────────────────────────
 * The feature cannot be finished by anyone but the site owner: it needs an
 * OAuth client created in a Google Cloud project by whoever owns the verified
 * ahantime.com property. Until those credentials are in the server's `.env`,
 * `status.configured` is false and this panel says exactly what is missing and
 * who has to do it — rather than showing a «اتصال» button that answers 409, or
 * (worse) hiding entirely so the half-built feature becomes invisible and
 * forgotten.
 *
 * The connect flow deliberately opens Google in the SAME tab: unlike the
 * article drawer there is no unsaved work on this page to lose, and a popup
 * carrying an OAuth consent is the pattern browsers block most aggressively.
 */
import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/resources/admin';
import { ApiError } from '@/lib/api/errors';
import { useToast } from '@/lib/hooks/useToast';
import { Alert, Badge, Button, Heading, useConfirm } from '@/components/ui';
import { useAuth } from '@/lib/hooks/useAuth';
import { formatJalali } from '@/lib/utils/jalali';
import ui from '../adminUi.module.css';

/** The closed outcome vocabulary the OAuth callback redirects with. */
const OUTCOME_MESSAGE: Record<string, { tone: 'success' | 'error' | 'warning'; text: string }> = {
  connected: { tone: 'success', text: 'اتصال به گوگل سرچ کنسول برقرار شد.' },
  denied: { tone: 'warning', text: 'دسترسی در صفحهٔ گوگل تأیید نشد؛ اتصالی برقرار نشد.' },
  invalid: {
    tone: 'error',
    text: 'پاسخ گوگل معتبر نبود یا منقضی شده بود. دوباره روی «اتصال به سرچ کنسول» بزنید.',
  },
  exchange: { tone: 'error', text: 'تبادل کلید با گوگل ناموفق بود. کمی بعد دوباره تلاش کنید.' },
  no_refresh_token: {
    tone: 'error',
    text: 'گوگل کلید ماندگار نداد. یک‌بار در حساب گوگل، دسترسی این برنامه را حذف کنید و دوباره متصل شوید.',
  },
  not_configured: { tone: 'error', text: 'کلیدهای Google Cloud روی سرور ثبت نشده‌اند.' },
};

export function SearchConsoleConnection() {
  const toast = useToast();
  const qc = useQueryClient();
  const params = useSearchParams();
  const { confirm, dialog } = useConfirm();
  /**
   * /admin/seo is a `content:write` page, but connecting a Google account is
   * `settings:write` — a سردبیر محتوا can legitimately be on this page and
   * must not be shown a button that would answer 404 (the admin API hides
   * rather than 403s). The server check is the real one; this only keeps the
   * UI honest about what this person can do.
   */
  const { can } = useAuth();
  const mayManage = can('settings:write');

  const router = useRouter();
  const pathname = usePathname();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin', 'search-console', 'status'],
    queryFn: () => adminApi.searchConsoleStatus(),
  });
  const status = data?.status;

  // The callback redirects back here with ?searchConsole=<outcome>; surface it
  // once, as a toast, and refetch so the panel reflects the new state.
  const outcome = params?.get('searchConsole') ?? null;
  useEffect(() => {
    if (!outcome) return;
    const message = OUTCOME_MESSAGE[outcome];
    if (!message) return;
    if (message.tone === 'success') toast.success(message.text);
    else toast.error(message.text);
    void qc.invalidateQueries({ queryKey: ['admin', 'search-console'] });
    // Strip the param, or every remount and every back-navigation re-announces
    // an outcome from minutes ago. `replace`, so it does not add a history
    // entry the admin has to click past.
    router.replace(pathname ?? '/admin/seo');
  }, [outcome, toast, qc, router, pathname]);

  const connect = useMutation({
    mutationFn: () => adminApi.connectSearchConsole(),
    onSuccess: (res) => {
      window.location.href = res.authUrl;
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'شروع اتصال ناموفق بود.'),
  });

  const disconnect = useMutation({
    mutationFn: () => adminApi.disconnectSearchConsole(),
    onSuccess: () => {
      toast.success('اتصال قطع شد و داده‌های ذخیره‌شده پاک شدند.');
      void qc.invalidateQueries({ queryKey: ['admin', 'search-console'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'قطع اتصال ناموفق بود.'),
  });

  if (isLoading) return null;
  // An unreachable status endpoint must NOT make the panel vanish: this
  // component exists so a half-configured integration stays visible, and
  // silently disappearing is the exact failure it is meant to prevent.
  if (isError || !status) {
    return (
      <section className={ui.panel} aria-labelledby="search-console-heading">
        <Heading level={2} id="search-console-heading">
          گوگل سرچ کنسول
        </Heading>
        <Alert tone="error">وضعیت اتصال خوانده نشد.</Alert>
        <Button size="sm" variant="ghost" onClick={() => void refetch()}>
          تلاش دوباره
        </Button>
      </section>
    );
  }

  return (
    <section className={ui.panel} aria-labelledby="search-console-heading">
      {dialog}
      <Heading level={2} id="search-console-heading">
        گوگل سرچ کنسول
      </Heading>

      {!status.configured ? (
        <>
          {/* `stale` is mapped to the same red as `loss` in Badge.module.css,
              which would render a neutral "not set up yet" state as a failure. */}
          <Badge tone="neutral">پیکربندی‌نشده</Badge>
          <Alert tone="info">
            برای اتصال، مالک سایت باید در Google Cloud یک «OAuth Client» از نوع Web application بسازد و سه مقدار
            <span dir="ltr"> GSC_CLIENT_ID</span>، <span dir="ltr">GSC_CLIENT_SECRET</span> و
            <span dir="ltr"> GSC_SITE_URL</span> را در فایل تنظیمات سرور ثبت کند؛ نشانی بازگشت مجاز هم باید دقیقاً
            <span dir="ltr"> https://panel.ahantime.com/api/admin/seo/search-console/callback</span> باشد. تا آن
            زمان این بخش غیرفعال است و در ویرایشگر مقاله هم چیزی نشان داده نمی‌شود.
          </Alert>
        </>
      ) : status.connected ? (
        <>
          <Badge tone="success">متصل</Badge>
          <div className={ui.tileHint}>
            property: <span dir="ltr">{status.siteUrl}</span>
          </div>
          {status.lastSyncAt ? (
            <div className={ui.tileHint}>آخرین دریافت داده: {formatJalali(new Date(status.lastSyncAt))}</div>
          ) : (
            <div className={ui.tileHint}>هنوز داده‌ای دریافت نشده؛ به‌روزرسانی خودکار روزی یک‌بار انجام می‌شود.</div>
          )}
          {status.siteUrlMismatch ? (
            <Alert tone="warning">
              نشانی property در تنظیمات سرور با چیزی که هنگام اتصال ثبت شده فرق دارد؛ تا زمانی که دوباره متصل نشوید
              داده‌ها ممکن است خالی بمانند.
            </Alert>
          ) : null}
          {status.lastError ? <Alert tone="error">{status.lastError}</Alert> : null}
          {!mayManage ? null : (
          <Button
            size="sm"
            variant="ghost"
            loading={disconnect.isPending}
            onClick={() =>
              void confirm({
                title: 'قطع اتصال سرچ کنسول؟',
                body: 'دسترسی این برنامه به حساب گوگل لغو می‌شود و داده‌های ذخیره‌شدهٔ عملکرد صفحه‌ها پاک می‌شود. هر زمان می‌توانید دوباره متصل شوید.',
                confirmLabel: 'قطع کن',
              }).then((ok) => {
                if (ok) disconnect.mutate();
              })
            }
          >
            قطع اتصال
          </Button>
          )}
        </>
      ) : (
        <>
          <Badge tone="neutral">متصل نیست</Badge>
          <div className={ui.tileHint}>
            با اتصال، عبارت‌هایی که کاربران در گوگل جستجو کرده‌اند و مقاله‌های شما در نتیجه‌شان دیده شده‌اند، داخل
            ویرایشگر هر مقاله نمایش داده می‌شود. دسترسی فقط خواندنی است.
          </div>
          {mayManage ? (
            <Button size="sm" variant="secondary" loading={connect.isPending} onClick={() => connect.mutate()}>
              اتصال به سرچ کنسول
            </Button>
          ) : (
            <div className={ui.tileHint}>برقراری این اتصال از دسترس شما خارج است؛ از مدیر سیستم بخواهید.</div>
          )}
        </>
      )}
    </section>
  );
}

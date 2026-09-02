'use client';
import { useState } from 'react';
import Link from 'next/link';
import { routes } from '@/lib/routes';
import { useCartStore } from '@/lib/stores/cart';
import { useRequestsStore } from '@/lib/stores/requests';
import { useAuthStore } from '@/lib/stores/auth';
import { useToast } from '@/lib/hooks/useToast';
import { api } from '@/lib/api';
import { API_MODE } from '@/lib/api/config';
import { ApiError } from '@/lib/api/errors';
import { trackGoal } from '@/lib/analytics/track';
import type { CreateLeadResult } from '@/lib/server/services/leads.service';
import { formatToman, toPersianDigits } from '@/lib/utils/format';
import { Textarea } from '@/components/forms/fields';
import { Button, EmptyState } from '@/components/ui';
import { CheckCircleIcon, DownloadIcon } from '@/components/primitives/icons';
import styles from './RequestFlow.module.css';

/**
 * The signed-in request flow — review the inquiry basket, add an optional note,
 * submit. On success the user gets an explicit confirmation that the request
 * reached the SALES TEAM, plus (when priced) a one-tap link to download the
 * branded پیش‌فاکتور PDF. The lead lands on the sales panel immediately.
 */
export function RequestFlow() {
  const toast = useToast();
  const items = useCartStore((s) => s.items);
  const clear = useCartStore((s) => s.clear);
  const addRequest = useRequestsStore((s) => s.add);
  const user = useAuthStore((s) => s.user);
  const authStatus = useAuthStore((s) => s.status);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<CreateLeadResult | null>(null);

  // ===== success confirmation =====
  if (done) {
    return (
      <div className={styles.success} role="status">
        <span className={styles.successIcon} aria-hidden="true">
          <CheckCircleIcon size={40} />
        </span>
        <h2 className={styles.successTitle}>درخواست شما به تیم فروش ارسال شد</h2>
        <p className={styles.successLead}>
          {done.proformaRef
            ? // The proforma below is ALREADY issued and binding (createLead priced
              // it automatically) — saying "کارشناس قیمت را نهایی می‌کند" here would
              // contradict that (audit finding #11). The rep still calls, but to
              // confirm delivery/logistics, not to set the price.
              'قیمت شما به‌صورت خودکار محاسبه و پیش‌فاکتور صادر شد. کارشناسان فروش آهن‌تایم برای هماهنگی تحویل با شما تماس می‌گیرند.'
            : 'کارشناسان فروش آهن‌تایم درخواست شما را دریافت کردند و برای نهایی‌کردن قیمت و شرایط تحویل با شما تماس می‌گیرند.'}
        </p>
        <p className={`${styles.successRef} tnum`}>
          کد پیگیری: <bdi>{done.ref}</bdi>
        </p>
        {done.proformaRef ? (
          <div className={styles.successProforma}>
            {done.priceChanged ? (
              <p className={styles.successNote} role="alert">
                توجه: قیمت یک یا چند قلم از زمانی که به سبد اضافه کردید به‌روزرسانی شده؛ مبلغ زیر قیمت
                لحظه‌ای و نهایی است.
              </p>
            ) : null}
            <p className="tnum">
              پیش‌فاکتور شما صادر شد
              {done.total ? <>، مبلغ {formatToman(done.total)}</> : null}
            </p>
            <Link
              href={`/proforma/${encodeURIComponent(done.proformaRef)}`}
              className={styles.pdfBtn}
              target="_blank"
              rel="noreferrer"
            >
              <DownloadIcon size={18} aria-hidden="true" />
              دانلود پیش‌فاکتور (PDF)
            </Link>
          </div>
        ) : (
          <p className={styles.successNote}>
            برخی اقلام نیاز به استعلام قیمت دارند؛ کارشناس فروش پیش‌فاکتور نهایی را برایتان ارسال می‌کند.
          </p>
        )}
        <div className={styles.successActions}>
          <Link href={routes.account('requests')} className={styles.trackLink}>
            پیگیری درخواست‌های من
          </Link>
          <Link href={routes.prices()} className={styles.editLink}>
            ادامهٔ خرید
          </Link>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        size="section"
        headline="سبد استعلام خالی است"
        body="از جدول‌های قیمت، کالاهای موردنظر را به سبد اضافه کنید تا برایشان پیش‌فاکتور بگیرید."
        primary={{ label: 'مشاهدهٔ قیمت‌ها', href: routes.prices() }}
      />
    );
  }

  const submit = async () => {
    const title =
      items.length === 1
        ? `پیش‌فاکتور ${items[0]!.name}`
        : `پیش‌فاکتور ${toPersianDigits(items.length)} قلم کالا`;
    const detail = items.map((i) => `${i.name} × ${toPersianDigits(i.qty)}`).join(' · ');

    // Never fall through to the local-only store while signed in: that path
    // writes to browser storage ONLY and the sales team never sees the lead,
    // yet the UI used to claim the request was filed. It is reachable in the
    // mock API mode alone, and only for a visitor we know is anonymous — the
    // real submit button is not rendered for them at all (see below).
    if (API_MODE === 'live') {
      if (!user) {
        toast.error('برای ثبت درخواست ابتدا وارد حساب کاربری شوید.');
        return;
      }
      setBusy(true);
      try {
        const result = await api.leads.create({
          contact: { name: user.name, mobile: user.mobile },
          items: items.map((i) => ({ skuId: i.skuId, qty: i.qty, unit: i.unit, quotedUnitPrice: i.unitPrice })),
          channel: 'sms',
          source: 'cart',
          note: note.trim() || undefined,
        });
        clear();
        // Conversion: this is the moment a visitor became a real sales lead.
        trackGoal('lead', 'cart-proforma', `${items.length} قلم`);
        setDone(result);
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : 'ثبت درخواست ناموفق بود. دوباره تلاش کنید.');
      } finally {
        setBusy(false);
      }
      return;
    }

    // Mock API mode (local development only — production is always live).
    addRequest({ type: 'proforma', title, detail, note: note.trim() || undefined });
    clear();
    toast.success('درخواست ثبت شد؛ وضعیت آن در پروفایل شماست.');
  };

  return (
    <div className={styles.flow}>
      <ul className={styles.items}>
        {items.map((i) => (
          <li key={i.skuId} className={styles.item}>
            <span className={styles.itemName}>{i.name}</span>
            <span className={`${styles.itemMeta} tnum`}>
              {toPersianDigits(i.qty)} {i.unit === 'kg' ? 'کیلوگرم' : 'عدد'}
              {i.unitPrice ? ` · ${formatToman(i.unitPrice, false)} تومان` : ''}
            </span>
          </li>
        ))}
      </ul>

      <Textarea
        label="توضیحات (اختیاری)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="مثلاً: تحویل تا پایان هفته، ترجیح کارخانهٔ خاص، شرایط پرداخت…"
        rows={3}
      />

      <div className={styles.actions}>
        {authStatus === 'anonymous' ? (
          // Same pattern as the advisor's پیش‌فاکتور card: a visitor we know is
          // signed out gets the login CTA, not a submit button that would file
          // nothing. The cart survives the round trip, so they come straight back.
          <Link href={routes.login(routes.request())} className={styles.loginBtn}>
            ورود به حساب کاربری
          </Link>
        ) : (
          <Button onClick={submit} disabled={busy || authStatus === 'loading'} loading={busy}>
            {busy ? 'در حال ثبت…' : 'ثبت درخواست پیش‌فاکتور'}
          </Button>
        )}
        <Link href={routes.cart()} className={styles.editLink}>
          ویرایش سبد
        </Link>
      </div>

      {authStatus === 'anonymous' && (
        <p className={styles.note}>
          بعد از ورود به همین صفحه برمی‌گردید؛ نام و شمارهٔ تماس از حساب شما برداشته می‌شود.
        </p>
      )}

      <p className={styles.note}>
        پس از ثبت، درخواست شما مستقیم به تیم فروش می‌رود و کارشناس برای نهایی‌کردن قیمت و شرایط تحویل تماس
        می‌گیرد. پرداخت آنلاین نداریم.
      </p>
    </div>
  );
}

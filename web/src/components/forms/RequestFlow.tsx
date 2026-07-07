'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { routes } from '@/lib/routes';
import { useCartStore } from '@/lib/stores/cart';
import { useRequestsStore } from '@/lib/stores/requests';
import { useAuthStore } from '@/lib/stores/auth';
import { useToast } from '@/lib/hooks/useToast';
import { api } from '@/lib/api';
import { API_MODE } from '@/lib/api/config';
import { ApiError } from '@/lib/api/errors';
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
  const router = useRouter();
  const toast = useToast();
  const items = useCartStore((s) => s.items);
  const clear = useCartStore((s) => s.clear);
  const addRequest = useRequestsStore((s) => s.add);
  const user = useAuthStore((s) => s.user);
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
          کارشناسان فروش آهن‌تایم درخواست شما را دریافت کردند و برای نهایی‌کردن قیمت و شرایط تحویل با شما
          تماس می‌گیرند.
        </p>
        <p className={`${styles.successRef} tnum`}>
          کد پیگیری: <bdi>{done.ref}</bdi>
        </p>
        {done.proformaRef ? (
          <div className={styles.successProforma}>
            <p className="tnum">
              پیش‌فاکتور شما صادر شد
              {done.total ? <> — مبلغ {formatToman(done.total)}</> : null}
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

    if (API_MODE === 'live' && user) {
      setBusy(true);
      try {
        const result = await api.leads.create({
          contact: { name: user.name, mobile: user.mobile },
          items: items.map((i) => ({ skuId: i.skuId, qty: i.qty, unit: i.unit })),
          channel: 'sms',
          source: 'cart',
          note: note.trim() || undefined,
        });
        clear();
        setDone(result);
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : 'ثبت درخواست ناموفق بود. دوباره تلاش کنید.');
      } finally {
        setBusy(false);
      }
      return;
    }

    addRequest({ type: 'proforma', title, detail, note: note.trim() || undefined });
    clear();
    toast.success('درخواست ثبت شد؛ وضعیت آن در پروفایل شماست.');
    router.push(routes.account('requests'));
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
        <Button onClick={submit} disabled={busy} loading={busy}>
          {busy ? 'در حال ثبت…' : 'ثبت درخواست پیش‌فاکتور'}
        </Button>
        <Link href={routes.cart()} className={styles.editLink}>
          ویرایش سبد
        </Link>
      </div>

      <p className={styles.note}>
        پس از ثبت، درخواست شما مستقیم به تیم فروش می‌رود و کارشناس برای نهایی‌کردن قیمت و شرایط تحویل تماس
        می‌گیرد. پرداخت آنلاین نداریم.
      </p>
    </div>
  );
}

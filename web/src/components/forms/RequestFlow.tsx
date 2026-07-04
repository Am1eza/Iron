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
import { formatToman, toPersianDigits } from '@/lib/utils/format';
import { Textarea } from '@/components/forms/fields';
import { Button, EmptyState } from '@/components/ui';
import styles from './RequestFlow.module.css';

/**
 * The signed-in request flow — no contact fields (the profile already has
 * them): review the inquiry basket, add an optional note, submit. The request
 * is filed under /account/requests and the basket is cleared.
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
    const detail = items
      .map((i) => `${i.name} × ${toPersianDigits(i.qty)}`)
      .join(' · ');

    // Live: the server creates the lead, issues the پیش‌فاکتور, SMSes the ref
    // and mirrors it into the account inbox. Mock: local store only.
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
        toast.success(`درخواست ثبت شد؛ شمارهٔ پیگیری: ${result.ref}`);
        router.push(routes.account('requests'));
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
        پس از ثبت، کارشناس برای نهایی‌کردن قیمت و شرایط تحویل تماس می‌گیرد. پرداخت آنلاین نداریم.
      </p>
    </div>
  );
}

'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { routes } from '@/lib/routes';
import { useCartStore } from '@/lib/stores/cart';
import { useRequestsStore } from '@/lib/stores/requests';
import { useToast } from '@/lib/hooks/useToast';
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
  const [note, setNote] = useState('');

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

  const submit = () => {
    const title =
      items.length === 1
        ? `پیش‌فاکتور ${items[0]!.name}`
        : `پیش‌فاکتور ${toPersianDigits(items.length)} قلم کالا`;
    const detail = items
      .map((i) => `${i.name} × ${toPersianDigits(i.qty)}`)
      .join(' · ');
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
        <Button onClick={submit}>ثبت درخواست پیش‌فاکتور</Button>
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

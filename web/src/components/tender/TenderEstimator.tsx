'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { routes } from '@/lib/routes';
import { api, ApiError } from '@/lib/api';
import { API_MODE } from '@/lib/api/config';
import { useAuthStore } from '@/lib/stores/auth';
import { useToast } from '@/lib/hooks/useToast';
import { trackGoal } from '@/lib/analytics/track';
import { formatToman, toPersianDigits } from '@/lib/utils/format';
import type { FactoryOption, TenderQuote } from '@/lib/server/services/tenderEstimate';
import type { CreateLeadResult } from '@/lib/server/services/leads.service';
import { Button } from '@/components/ui';
import { CheckCircleIcon, DownloadIcon, PlusIcon, TrashIcon } from '@/components/primitives/icons';
import styles from './TenderEstimator.module.css';

type CatOption = { slug: string; name: string };
type SubOption = { slug: string; name: string };

type Row = {
  id: string;
  categorySlug: string;
  subSlug: string;
  size: string;
  sizes: string[];
  factories: FactoryOption[];
  skuId: string;
  qty: string;
  loading: boolean;
};


function emptyRow(): Row {
  return {
    id: crypto.randomUUID(),
    categorySlug: '',
    subSlug: '',
    size: '',
    sizes: [],
    factories: [],
    skuId: '',
    qty: '',
    loading: false,
  };
}

/** Cheapest priced option — the row's default selection when factories load. */
function defaultSku(factories: FactoryOption[]): string {
  return factories.find((f) => f.cheapest)?.skuId ?? factories[0]?.skuId ?? '';
}

/**
 * برآورد مناقصات — a multi-row estimate table. Each row resolves to one of our
 * own SKUs (category → product → size → factory, defaulting to the cheapest
 * factory but freely changeable), and every price/weight/total shown comes from
 * the server (/api/tender/*), never the client — so the running total equals,
 * to the ریال, the پیش‌فاکتور the user gets on submit.
 */
export function TenderEstimator({
  categories,
  subsByCat,
}: {
  categories: CatOption[];
  subsByCat: Record<string, SubOption[]>;
}) {
  const user = useAuthStore((s) => s.user);
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>(() => [emptyRow(), emptyRow()]);
  const [quote, setQuote] = useState<TenderQuote | null>(null);
  const [pricing, setPricing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<CreateLeadResult | null>(null);
  const [note, setNote] = useState('');

  const patch = useCallback((id: string, next: Partial<Row>) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...next } : r)));
  }, []);

  const loadOptions = useCallback(
    async (id: string, categorySlug: string, subSlug: string, size?: string) => {
      patch(id, { loading: true });
      try {
        const { sizes, factories } = await api.tender.options({ category: categorySlug, sub: subSlug, size });
        // A product with real size variants must have a size picked before its
        // factory prices mean anything; one with no size dimension resolves its
        // factories immediately.
        if (sizes.length > 0 && !size) {
          patch(id, { sizes, factories: [], skuId: '', loading: false });
        } else {
          patch(id, { sizes, factories, skuId: defaultSku(factories), loading: false });
        }
      } catch {
        patch(id, { loading: false });
        toast.error('دریافت گزینه‌های این محصول ناموفق بود.');
      }
    },
    [patch, toast],
  );

  const onCategory = (id: string, slug: string) =>
    patch(id, { categorySlug: slug, subSlug: '', size: '', sizes: [], factories: [], skuId: '' });

  const onSub = (id: string, slug: string) => {
    patch(id, { subSlug: slug, size: '', sizes: [], factories: [], skuId: '' });
    const row = rows.find((r) => r.id === id);
    if (row && slug) void loadOptions(id, row.categorySlug, slug);
  };

  const onSize = (id: string, size: string) => {
    patch(id, { size, factories: [], skuId: '' });
    const row = rows.find((r) => r.id === id);
    if (row && size) void loadOptions(id, row.categorySlug, row.subSlug, size);
  };

  const addRow = () => setRows((rs) => [...rs, emptyRow()]);
  const removeRow = (id: string) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.id !== id) : rs));

  // ===== live pricing (debounced) =====
  // Rows ready to price: a chosen SKU + a positive qty. Sent in row order so
  // the server's ordered lines map straight back by index.
  const priceable = rows
    .map((r) => ({ id: r.id, skuId: r.skuId, qty: Number(r.qty) }))
    .filter((r) => r.skuId && Number.isFinite(r.qty) && r.qty > 0);
  const priceKey = priceable.map((r) => `${r.skuId}:${r.qty}`).join('|');
  const priceKeyRef = useRef('');

  useEffect(() => {
    if (API_MODE !== 'live') return;
    if (!priceKey) {
      setQuote(null);
      return;
    }
    priceKeyRef.current = priceKey;
    const items = priceable.map((r) => ({ skuId: r.skuId, qty: r.qty }));
    const t = setTimeout(async () => {
      setPricing(true);
      try {
        const q = await api.tender.price(items);
        // Ignore a stale response if the rows changed while it was in flight.
        if (priceKeyRef.current === priceKey) setQuote(q);
      } catch {
        /* transient — the next edit re-prices */
      } finally {
        setPricing(false);
      }
    }, 400);
    return () => clearTimeout(t);
    // priceKey is the exact debounce trigger; items is derived from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceKey]);

  const lineById = new Map<string, TenderQuote['lines'][number]>();
  if (quote) priceable.forEach((r, i) => quote.lines[i] && lineById.set(r.id, quote.lines[i]!));

  const submit = async () => {
    const items = priceable.map((r) => {
      const row = rows.find((x) => x.id === r.id)!;
      const opt = row.factories.find((f) => f.skuId === r.skuId);
      return { skuId: r.skuId, qty: r.qty, unit: opt?.unit ?? ('kg' as const) };
    });
    if (items.length === 0) {
      toast.error('حداقل یک ردیف کامل (محصول و مقدار) اضافه کنید.');
      return;
    }
    if (API_MODE === 'live' && user) {
      setBusy(true);
      try {
        const result = await api.leads.create({
          contact: { name: user.name, mobile: user.mobile },
          items,
          channel: 'sms',
          source: 'tender',
          note: note.trim() || undefined,
        });
        trackGoal('lead', 'tender-estimate', `${items.length} قلم`);
        setDone(result);
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : 'ثبت برآورد ناموفق بود. دوباره تلاش کنید.');
      } finally {
        setBusy(false);
      }
    }
  };

  // ===== success =====
  if (done) {
    return (
      <div className={styles.success} role="status">
        <span className={styles.successIcon} aria-hidden="true">
          <CheckCircleIcon size={40} />
        </span>
        <h2 className={styles.successTitle}>برآورد شما ثبت و به تیم فروش ارسال شد</h2>
        <p className={styles.successLead}>
          کارشناسان آهن‌تایم برآورد مناقصهٔ شما را دریافت کردند و برای نهایی‌کردن قیمت و شرایط با شما هماهنگ
          می‌کنند.
        </p>
        <p className={`${styles.successRef} tnum`}>
          کد پیگیری: <bdi>{done.ref}</bdi>
        </p>
        {done.proformaRef ? (
          <div className={styles.successProforma}>
            <p className="tnum">پیش‌فاکتور شما صادر شد{done.total ? <> — مبلغ {formatToman(done.total)}</> : null}</p>
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
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">دسته</th>
              <th scope="col">محصول</th>
              <th scope="col">سایز</th>
              <th scope="col">کارخانه</th>
              <th scope="col">مقدار</th>
              <th scope="col">وزن</th>
              <th scope="col">قیمت واحد</th>
              <th scope="col">جمع ردیف</th>
              <th scope="col"><span className="sr-only">حذف</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const line = lineById.get(row.id);
              const subs = subsByCat[row.categorySlug] ?? [];
              return (
                <tr key={row.id}>
                  <td data-label="دسته">
                    <select
                      className={styles.select}
                      aria-label="دسته"
                      value={row.categorySlug}
                      onChange={(e) => onCategory(row.id, e.target.value)}
                    >
                      <option value="">انتخاب…</option>
                      {categories.map((c) => (
                        <option key={c.slug} value={c.slug}>{c.name}</option>
                      ))}
                    </select>
                  </td>
                  <td data-label="محصول">
                    <select
                      className={styles.select}
                      aria-label="محصول"
                      value={row.subSlug}
                      disabled={!row.categorySlug}
                      onChange={(e) => onSub(row.id, e.target.value)}
                    >
                      <option value="">انتخاب…</option>
                      {subs.map((s) => (
                        <option key={s.slug} value={s.slug}>{s.name}</option>
                      ))}
                    </select>
                  </td>
                  <td data-label="سایز">
                    {row.sizes.length > 0 ? (
                      <select
                        className={styles.select}
                        aria-label="سایز"
                        value={row.size}
                        onChange={(e) => onSize(row.id, e.target.value)}
                      >
                        <option value="">انتخاب…</option>
                        {row.sizes.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={styles.dash}>—</span>
                    )}
                  </td>
                  <td data-label="کارخانه">
                    {row.factories.length > 0 ? (
                      <select
                        className={styles.select}
                        aria-label="کارخانه"
                        value={row.skuId}
                        onChange={(e) => patch(row.id, { skuId: e.target.value })}
                      >
                        {row.factories.map((f) => (
                          <option key={f.skuId} value={f.skuId}>
                            {f.factory}
                            {f.unitPrice == null ? ' (استعلام)' : ''}
                            {f.cheapest ? ' — ارزان‌ترین' : ''}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className={styles.dash}>{row.loading ? '…' : '—'}</span>
                    )}
                  </td>
                  <td data-label="مقدار">
                    <input
                      className={styles.qty}
                      inputMode="numeric"
                      aria-label="مقدار"
                      value={row.qty}
                      onChange={(e) => patch(row.id, { qty: e.target.value.replace(/[^\d.]/g, '') })}
                      placeholder="۰"
                    />
                  </td>
                  <td data-label="وزن" className="tnum">
                    {line?.weightKg != null ? `${toPersianDigits(line.weightKg)} کیلوگرم` : <span className={styles.dash}>—</span>}
                  </td>
                  <td data-label="قیمت واحد" className="tnum">
                    {line?.priced ? formatToman(line.unitPrice!, false) : <span className={styles.quote}>استعلام</span>}
                  </td>
                  <td data-label="جمع ردیف" className="tnum">
                    {line?.priced ? formatToman(line.lineTotal!, false) : <span className={styles.dash}>—</span>}
                  </td>
                  <td>
                    <button
                      type="button"
                      className={styles.removeBtn}
                      onClick={() => removeRow(row.id)}
                      aria-label="حذف ردیف"
                      disabled={rows.length <= 1}
                    >
                      <TrashIcon size={18} aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className={styles.toolbar}>
        <button type="button" className={styles.addBtn} onClick={addRow} disabled={rows.length >= 100}>
          <PlusIcon size={18} aria-hidden="true" />
          افزودن ردیف
        </button>
        {pricing ? <span className={styles.pricing}>در حال محاسبه…</span> : null}
      </div>

      <div className={styles.summary}>
        <dl className={styles.totals}>
          <div>
            <dt>جمع کل (بدون مالیات)</dt>
            <dd className="tnum">{quote ? formatToman(quote.subtotal) : '—'}</dd>
          </div>
          <div>
            <dt>مالیات بر ارزش افزوده{quote ? ` (${toPersianDigits(Math.round(quote.vatRate * 100))}٪)` : ''}</dt>
            <dd className="tnum">{quote ? formatToman(quote.vatAmount) : '—'}</dd>
          </div>
          <div className={styles.grand}>
            <dt>مبلغ نهایی</dt>
            <dd className="tnum">{quote ? formatToman(quote.grandTotal) : '—'}</dd>
          </div>
        </dl>
        {quote && !quote.allPriced ? (
          <p className={styles.partial}>
            برخی اقلام قیمت زندهٔ لحظه‌ای ندارند و «استعلام» شده‌اند؛ کارشناس قیمت آن‌ها را در پیش‌فاکتور نهایی
            اعلام می‌کند.
          </p>
        ) : null}
      </div>

      <textarea
        className={styles.note}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="توضیحات (اختیاری): مهلت مناقصه، شرایط تحویل، الزام کارخانه/استاندارد خاص…"
        aria-label="توضیحات"
      />

      {API_MODE === 'live' && !user ? (
        <div className={styles.actions}>
          <Link href={routes.login(routes.tender())} className={styles.loginBtn}>
            برای ثبت برآورد و دریافت پیش‌فاکتور وارد شوید
          </Link>
        </div>
      ) : (
        <div className={styles.actions}>
          <Button onClick={submit} disabled={busy} loading={busy}>
            {busy ? 'در حال ثبت…' : 'ثبت برآورد و دریافت پیش‌فاکتور'}
          </Button>
        </div>
      )}

      <p className={styles.disclaimer}>
        قیمت‌ها بر پایهٔ نرخ روز محصولات آهن‌تایم محاسبه می‌شود و تا صدور پیش‌فاکتور نهایی ممکن است تغییر کند.
        پرداخت آنلاین نداریم؛ پس از ثبت، کارشناس فروش برای نهایی‌کردن تماس می‌گیرد.
      </p>
    </div>
  );
}

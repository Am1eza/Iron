'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { routes } from '@/lib/routes';
import { api, ApiError } from '@/lib/api';
import { API_MODE } from '@/lib/api/config';
import { useAuthStore } from '@/lib/stores/auth';
import { useToast } from '@/lib/hooks/useToast';
import { trackGoal } from '@/lib/analytics/track';
import { formatToman, localizeDigits } from '@/lib/utils/format';
import { getLocalizedName } from '@/lib/utils/localizedNames';
import type { FactoryOption, TenderQuote } from '@/lib/server/services/tenderEstimate';
import type { CreateLeadResult } from '@/lib/server/services/leads.service';
import type { AppLocale } from '@/i18n/config';
import { Button } from '@/components/ui';
import { CheckCircleIcon, DownloadIcon, PlusIcon, TrashIcon } from '@/components/primitives/icons';
import styles from './TenderEstimator.module.css';

type CatOption = { slug: string; name: string; nameEn?: string; nameAr?: string; nameZh?: string };
type SubOption = { slug: string; name: string; nameEn?: string; nameAr?: string; nameZh?: string };

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
 *
 * Category/product names are localized client-side via `getLocalizedName`
 * (i18n audit follow-up) — `categories`/`subsByCat` carry the same
 * `nameEn`/`nameAr`/`nameZh` columns already backfilled for the rest of the
 * catalog; a category/sub without a translation falls back to its fa name.
 */
export function TenderEstimator({
  categories,
  subsByCat,
}: {
  categories: CatOption[];
  subsByCat: Record<string, SubOption[]>;
}) {
  const t = useTranslations('tenderEstimator');
  const locale = useLocale() as AppLocale;
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
        toast.error(t('optionsFetchError'));
      }
    },
    [patch, toast, t],
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
    const timer = setTimeout(async () => {
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
    return () => clearTimeout(timer);
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
      toast.error(t('minRowError'));
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
        // Analytics label kept in fa for consistency with every other
        // trackGoal call site in this codebase (PriceTable, etc.) — an
        // internal event payload, not user-facing text.
        trackGoal('lead', 'tender-estimate', `${items.length} قلم`);
        setDone(result);
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : t('submitErrorGeneric'));
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
        <h2 className={styles.successTitle}>{t('successTitle')}</h2>
        <p className={styles.successLead}>{t('successLead')}</p>
        <p className={`${styles.successRef} tnum`}>{t('successRef', { ref: done.ref })}</p>
        {done.proformaRef ? (
          <div className={styles.successProforma}>
            <p className="tnum">
              {done.total ? t('proformaIssuedWithAmount', { amount: formatToman(done.total) }) : t('proformaIssued')}
            </p>
            <Link
              href={`/proforma/${encodeURIComponent(done.proformaRef)}`}
              className={styles.pdfBtn}
              target="_blank"
              rel="noreferrer"
            >
              <DownloadIcon size={18} aria-hidden="true" />
              {t('downloadProforma')}
            </Link>
          </div>
        ) : (
          <p className={styles.successNote}>{t('successNoteQuote')}</p>
        )}
        <div className={styles.successActions}>
          <Link href={routes.account('requests')} className={styles.trackLink}>
            {t('trackRequests')}
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
              <th scope="col">{t('tableHeaders.category')}</th>
              <th scope="col">{t('tableHeaders.product')}</th>
              <th scope="col">{t('tableHeaders.size')}</th>
              <th scope="col">{t('tableHeaders.factory')}</th>
              <th scope="col">{t('tableHeaders.qty')}</th>
              <th scope="col">{t('tableHeaders.weight')}</th>
              <th scope="col">{t('tableHeaders.unitPrice')}</th>
              <th scope="col">{t('tableHeaders.lineTotal')}</th>
              <th scope="col"><span className="sr-only">{t('tableHeaders.remove')}</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const line = lineById.get(row.id);
              const subs = subsByCat[row.categorySlug] ?? [];
              return (
                <tr key={row.id}>
                  <td data-label={t('tableHeaders.category')}>
                    <select
                      className={styles.select}
                      aria-label={t('tableHeaders.category')}
                      value={row.categorySlug}
                      onChange={(e) => onCategory(row.id, e.target.value)}
                    >
                      <option value="">{t('selectPlaceholder')}</option>
                      {categories.map((c) => (
                        <option key={c.slug} value={c.slug}>{getLocalizedName(c, locale)}</option>
                      ))}
                    </select>
                  </td>
                  <td data-label={t('tableHeaders.product')}>
                    <select
                      className={styles.select}
                      aria-label={t('tableHeaders.product')}
                      value={row.subSlug}
                      disabled={!row.categorySlug}
                      onChange={(e) => onSub(row.id, e.target.value)}
                    >
                      <option value="">{t('selectPlaceholder')}</option>
                      {subs.map((s) => (
                        <option key={s.slug} value={s.slug}>{getLocalizedName(s, locale)}</option>
                      ))}
                    </select>
                  </td>
                  <td data-label={t('tableHeaders.size')}>
                    {row.sizes.length > 0 ? (
                      <select
                        className={styles.select}
                        aria-label={t('tableHeaders.size')}
                        value={row.size}
                        onChange={(e) => onSize(row.id, e.target.value)}
                      >
                        <option value="">{t('selectPlaceholder')}</option>
                        {row.sizes.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={styles.dash}>{t('unknown')}</span>
                    )}
                  </td>
                  <td data-label={t('tableHeaders.factory')}>
                    {row.factories.length > 0 ? (
                      <select
                        className={styles.select}
                        aria-label={t('tableHeaders.factory')}
                        value={row.skuId}
                        onChange={(e) => patch(row.id, { skuId: e.target.value })}
                      >
                        {row.factories.map((f) => (
                          <option key={f.skuId} value={f.skuId}>
                            {f.factory}
                            {f.unitPrice == null ? ` ${t('factoryQuoteSuffix')}` : ''}
                            {f.cheapest ? t('factoryCheapestSuffix') : ''}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className={styles.dash}>{row.loading ? '…' : t('unknown')}</span>
                    )}
                  </td>
                  <td data-label={t('tableHeaders.qty')}>
                    <input
                      className={styles.qty}
                      inputMode="numeric"
                      aria-label={t('tableHeaders.qty')}
                      value={row.qty}
                      onChange={(e) => patch(row.id, { qty: e.target.value.replace(/[^\d.]/g, '') })}
                      placeholder={localizeDigits(0, locale)}
                    />
                  </td>
                  <td data-label={t('tableHeaders.weight')} className="tnum">
                    {line?.weightKg != null ? (
                      `${localizeDigits(line.weightKg, locale)} ${t('weightUnit')}`
                    ) : (
                      <span className={styles.dash}>{t('unknown')}</span>
                    )}
                  </td>
                  <td data-label={t('tableHeaders.unitPrice')} className="tnum">
                    {line?.priced ? formatToman(line.unitPrice!, false) : <span className={styles.quote}>{t('quoteLabel')}</span>}
                  </td>
                  <td data-label={t('tableHeaders.lineTotal')} className="tnum">
                    {line?.priced ? formatToman(line.lineTotal!, false) : <span className={styles.dash}>{t('unknown')}</span>}
                  </td>
                  <td>
                    <button
                      type="button"
                      className={styles.removeBtn}
                      onClick={() => removeRow(row.id)}
                      aria-label={t('removeRowAria')}
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
          {t('addRow')}
        </button>
        {pricing ? <span className={styles.pricing}>{t('pricingInProgress')}</span> : null}
      </div>

      <div className={styles.summary}>
        <dl className={styles.totals}>
          <div>
            <dt>{t('subtotalLabel')}</dt>
            <dd className="tnum">{quote ? formatToman(quote.subtotal) : t('unknown')}</dd>
          </div>
          <div>
            <dt>
              {quote
                ? t('vatLabelWithRate', { rate: localizeDigits(Math.round(quote.vatRate * 100), locale) })
                : t('vatLabel')}
            </dt>
            <dd className="tnum">{quote ? formatToman(quote.vatAmount) : t('unknown')}</dd>
          </div>
          <div className={styles.grand}>
            <dt>{t('grandTotalLabel')}</dt>
            <dd className="tnum">{quote ? formatToman(quote.grandTotal) : t('unknown')}</dd>
          </div>
        </dl>
        {quote && !quote.allPriced ? <p className={styles.partial}>{t('partialPricingNote')}</p> : null}
      </div>

      <textarea
        className={styles.note}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder={t('notePlaceholder')}
        aria-label={t('noteAriaLabel')}
      />

      {API_MODE === 'live' && !user ? (
        <div className={styles.actions}>
          <Link href={routes.login(routes.tender())} className={styles.loginBtn}>
            {t('loginToSubmit')}
          </Link>
        </div>
      ) : (
        <div className={styles.actions}>
          <Button onClick={submit} disabled={busy} loading={busy}>
            {busy ? t('submitting') : t('submitCta')}
          </Button>
        </div>
      )}

      <p className={styles.disclaimer}>{t('disclaimer')}</p>
    </div>
  );
}

'use client';
import { useState } from 'react';
import Link from 'next/link';
import { routes } from '@/lib/routes';
import { api, isApiError } from '@/lib/api';
import { formatToman, toPersianDigits } from '@/lib/utils/format';
import { CITIES } from '@/lib/data/logistics';
import { PRICE_UNIT_VALUES, type PriceUnit } from '@/lib/types/domain';
import { PRICE_UNIT_LABEL } from '@/lib/utils/catalogLabels';
import { CheckCircleIcon, DownloadIcon, WhatsappIcon, PhoneIcon } from '@/components/primitives/icons';
import { useAuthStore } from '@/lib/stores/auth';
import { useCartStore } from '@/lib/stores/cart';
import { trackGoal } from '@/lib/analytics/track';
import styles from './ProformaCard.module.css';

/** One priced line of a pending پیش‌فاکتور draft — SERVER-priced (aiTools'
 *  prepareProforma and POST /api/ai/lead/draft both go through `priceItems`).
 *  The client never computes any of these numbers; it only says what changed. */
export type DraftLine = {
  /** Addresses the line for an edit or a cart add. Never displayed. */
  skuId?: string;
  name: string;
  qty: number;
  unit: string;
  weightKg?: number;
  unitPrice?: number;
  lineTotal?: number;
};

/**
 * The advisor's «خلاصهٔ درخواست» card. The model prepares it; only the
 * visitor's own tap (or, for a guest, sign-in then tap) creates the lead.
 * `confirmedRef` is set once that happened — it lives ON the message so a
 * restored thread comes back confirmed rather than offering the button twice.
 */
export type LeadDraftView = {
  draftId: string;
  items: DraftLine[];
  totalWeightKg?: number;
  total?: number;
  allPriced?: boolean;
  signedIn?: boolean;
  /** Delivery city — editable here, recorded on the lead at confirm. */
  city?: string;
  confirmedRef?: string;
  proformaRef?: string;
};

const CONTACT_MOBILE = '09121395954';
const WHATSAPP_BASE = 'https://wa.me/98' + CONTACT_MOBILE.slice(1);

/** Units a customer actually orders in. `sqm` is excluded deliberately: it is
 *  a pricing basis for plate, not a quantity a buyer states at this counter. */
const ORDERABLE_UNITS: readonly PriceUnit[] = PRICE_UNIT_VALUES.filter((u) => u !== 'sqm');

/** «۳ تن میلگرد ۱۴ …» — the request as a message a person can read, for the
 *  WhatsApp hand-off. Built from the SERVER's own priced lines, so what the
 *  رep receives on WhatsApp is the same list as the card. */
function whatsappText(draft: LeadDraftView): string {
  const lines = draft.items.map(
    (i) => `• ${i.name} — ${toPersianDigits(i.qty.toLocaleString('en-US'))} ${PRICE_UNIT_LABEL[i.unit as PriceUnit] ?? i.unit}`,
  );
  return [
    'سلام، از مشاور هوشمند آهن‌تایم:',
    ...lines,
    draft.city ? `شهر تحویل: ${draft.city}` : '',
    'لطفاً قیمت و زمان تحویل را تأیید کنید.',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * The interactive پیش‌فاکتور.
 *
 * WHAT CHANGED AND WHY. This card used to be read-only: to change «۳ تن» to
 * «۵ تن» the visitor had to type a sentence back into the chat and wait for a
 * model round trip to redraw a card they were already looking at. That is the
 * difference between a summary and a document you can work with. Quantity,
 * unit and delivery city are now fields.
 *
 * EVERY NUMBER STILL COMES FROM THE SERVER. An edit posts only what changed
 * (sku, qty, unit) and the server reprices through the same `priceItems` the
 * lead is created with; the response replaces the card. There is no path here
 * that multiplies a price by a quantity — a total a customer keeps must never
 * be a number their own browser computed.
 *
 * THE CONFIRM BUTTON IS STILL THE ONLY THING THAT FILES ANYTHING. Editing a
 * draft never creates a lead, never sends an SMS, and keeps the same draft id,
 * so an edited card cannot leave a stale confirmable copy behind.
 */
export function ProformaCard({
  draft,
  onConfirmed,
  onChanged,
}: {
  draft: LeadDraftView;
  onConfirmed: (patch: Partial<LeadDraftView>) => void;
  /** An edit repriced — the parent stores the new card on the message so it
   *  survives a reload and a re-render of the thread. */
  onChanged: (patch: Partial<LeadDraftView>) => void;
}) {
  const authStatus = useAuthStore((s) => s.status);
  // `AuthHydrator` resolves the session client-side, so the store reads
  // 'loading' on first paint. The server already told us whether the visitor
  // was signed in when the draft was prepared — trust that for the first frame
  // so a signed-in customer never sees the login button flash.
  const signedIn = authStatus === 'authenticated' || (authStatus === 'loading' && Boolean(draft.signedIn));
  const addToCart = useCartStore((s) => s.add);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  const editable = !draft.confirmedRef && draft.items.every((i) => Boolean(i.skuId));

  /** Push one edit through the server and adopt whatever it prices back. */
  const applyEdit = async (items: DraftLine[], city: string | undefined) => {
    if (!editable) return;
    setSaving(true);
    setError(null);
    try {
      const next = await api.ai.updateDraft({
        draftId: draft.draftId,
        items: items.map((i) => ({ skuId: i.skuId!, qty: i.qty, unit: i.unit })),
        ...(city !== undefined ? { city } : {}),
      });
      onChanged({
        items: next.items,
        totalWeightKg: next.totalWeightKg,
        total: next.total,
        allPriced: next.allPriced,
        city: next.city,
      });
    } catch (e) {
      setError(
        isApiError(e) ? e.message : 'به‌روزرسانی انجام نشد. اتصال را بررسی کن و دوباره تلاش کن.',
      );
    } finally {
      setSaving(false);
    }
  };

  const setLine = (index: number, patch: Partial<DraftLine>) => {
    const items = draft.items.map((it, i) => (i === index ? { ...it, ...patch } : it));
    void applyEdit(items, undefined);
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.ai.confirmLead(draft.draftId);
      trackGoal('lead', 'ai-advisor', `${draft.items.length} قلم`);
      onConfirmed({ confirmedRef: result.ref, proformaRef: result.proformaRef, total: result.total });
    } catch (e) {
      setError(isApiError(e) ? e.message : 'ثبت درخواست انجام نشد. اتصال را بررسی کن و دوباره تلاش کن.');
    } finally {
      setBusy(false);
    }
  };

  /* ---------------------------------------------------------- confirmed -- */

  if (draft.confirmedRef) {
    return (
      <div className={styles.card} role="status">
        <div className={styles.head}>
          <span className={styles.badge}>درخواست ثبت شد</span>
        </div>
        <div className={styles.done}>
          <CheckCircleIcon size={16} aria-hidden="true" />
          <span className="tnum">
            کد پیگیری: <bdi>{toPersianDigits(draft.confirmedRef)}</bdi>
          </span>
        </div>
        <p className={styles.note}>کارشناس فروش برای نهایی‌کردن قیمت و زمان تحویل با تو تماس می‌گیرد.</p>
        <div className={styles.actions}>
          {draft.proformaRef ? (
            // The پیش‌فاکتور page carries the branded print-to-PDF sheet, which
            // is where a real downloadable file actually comes from — the card
            // links to it rather than pretending to generate one itself.
            <Link
              href={`/proforma/${encodeURIComponent(draft.proformaRef)}`}
              className={styles.cta}
              target="_blank"
              rel="noreferrer"
            >
              <DownloadIcon size={15} aria-hidden="true" />
              دیدن و دانلود پیش‌فاکتور
            </Link>
          ) : null}
          <Link href={routes.account('requests')} className={styles.ghost}>
            پیگیری درخواست‌های من
          </Link>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------ pending -- */

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <span className={styles.badge}>خلاصهٔ درخواست پیش‌فاکتور</span>
        {saving ? (
          <span className={styles.saving} role="status">
            در حال به‌روزرسانی قیمت…
          </span>
        ) : null}
      </div>

      <ul className={styles.items}>
        {draft.items.map((it, i) => (
          <li key={`${it.skuId ?? it.name}-${i}`} className={styles.item}>
            <span className={styles.itemName}>{it.name}</span>
            <div className={styles.itemControls}>
              {editable ? (
                <>
                  <label className="visually-hidden" htmlFor={`${draft.draftId}-qty-${i}`}>
                    مقدار {it.name}
                  </label>
                  <input
                    id={`${draft.draftId}-qty-${i}`}
                    className={`${styles.qty} tnum`}
                    type="number"
                    inputMode="decimal"
                    min={1}
                    step={1}
                    defaultValue={it.qty}
                    disabled={saving}
                    // On blur, not on every keystroke: each change is a real
                    // server repricing, and firing one per digit would price
                    // «5», «50», «500» on the way to «5000».
                    onBlur={(e) => {
                      const qty = Number(e.target.value);
                      if (Number.isFinite(qty) && qty > 0 && qty !== it.qty) setLine(i, { qty });
                      else e.target.value = String(it.qty);
                    }}
                  />
                  <label className="visually-hidden" htmlFor={`${draft.draftId}-unit-${i}`}>
                    واحد {it.name}
                  </label>
                  <select
                    id={`${draft.draftId}-unit-${i}`}
                    className={styles.unit}
                    value={it.unit}
                    disabled={saving}
                    onChange={(e) => setLine(i, { unit: e.target.value })}
                  >
                    {ORDERABLE_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {PRICE_UNIT_LABEL[u]}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <span className="tnum">
                  {toPersianDigits(it.qty.toLocaleString('en-US'))}{' '}
                  {PRICE_UNIT_LABEL[it.unit as PriceUnit] ?? it.unit}
                </span>
              )}
              {it.lineTotal ? <span className={`${styles.lineTotal} tnum`}>{formatToman(it.lineTotal)}</span> : null}
            </div>
          </li>
        ))}
      </ul>

      {editable ? (
        <div className={styles.cityRow}>
          <label className={styles.cityLabel} htmlFor={`${draft.draftId}-city`}>
            شهر تحویل
          </label>
          <select
            id={`${draft.draftId}-city`}
            className={styles.city}
            value={draft.city ?? ''}
            disabled={saving}
            onChange={(e) => void applyEdit(draft.items, e.target.value)}
          >
            <option value="">انتخاب نشده</option>
            {CITIES.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
          <span className={styles.cityHint}>کرایهٔ حمل را کارشناس در پیش‌فاکتور اعلام می‌کند.</span>
        </div>
      ) : null}

      {(draft.totalWeightKg || draft.total) && (
        <div className={styles.totals}>
          {draft.totalWeightKg ? (
            <div>
              <span className={styles.totalLabel}>وزن کل</span>
              <span className={`${styles.totalValue} tnum`}>
                {toPersianDigits(Math.round(draft.totalWeightKg).toLocaleString('en-US'))} کیلوگرم
              </span>
            </div>
          ) : null}
          {draft.total ? (
            <div>
              <span className={styles.totalLabel}>جمع کل</span>
              <span className={`${styles.totalValue} tnum`}>{formatToman(draft.total)}</span>
            </div>
          ) : null}
        </div>
      )}

      {!draft.allPriced && (
        <p className={styles.note}>
          قیمت بعضی اقلام را کارشناس اعلام می‌کند؛ درخواستت مستقیم به تیم فروش می‌رود.
        </p>
      )}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.actions}>
        {signedIn ? (
          <button
            type="button"
            className={styles.cta}
            onClick={() => void confirm()}
            disabled={busy || saving || authStatus === 'loading'}
          >
            {busy ? 'در حال ثبت…' : 'تأیید و ثبت درخواست'}
          </button>
        ) : (
          <Link href={routes.login(routes.ai())} className={styles.cta}>
            ورود به حساب کاربری
          </Link>
        )}

        {draft.items.every((i) => i.skuId) ? (
          <button
            type="button"
            className={styles.ghost}
            disabled={saving}
            onClick={() => {
              for (const it of draft.items) {
                addToCart({
                  skuId: it.skuId!,
                  name: it.name,
                  qty: it.qty,
                  unit: it.unit as PriceUnit,
                  ...(it.unitPrice !== undefined ? { unitPrice: it.unitPrice } : {}),
                  ...(it.weightKg !== undefined ? { weightKg: it.weightKg } : {}),
                });
              }
              setAdded(true);
            }}
          >
            {added ? 'به سبد اضافه شد' : 'افزودن به سبد'}
          </button>
        ) : null}

        <a
          className={styles.ghost}
          href={`${WHATSAPP_BASE}?text=${encodeURIComponent(whatsappText(draft))}`}
          target="_blank"
          rel="noreferrer noopener"
        >
          <WhatsappIcon size={15} aria-hidden="true" />
          ارسال در واتساپ
        </a>
      </div>

      {!signedIn && (
        <p className={styles.note}>
          بعد از ورود، به همین گفتگو برمی‌گردی و با یک دکمه درخواست را ثبت می‌کنی؛ نام و شماره از حسابت
          برداشته می‌شود.
        </p>
      )}

      <p className={styles.human}>
        <PhoneIcon size={14} aria-hidden="true" />
        <span>
          سؤال فنی داری یا چیزی اینجا جور نیست؟{' '}
          <a href={`tel:${CONTACT_MOBILE}`} dir="ltr">
            <bdi>{toPersianDigits(CONTACT_MOBILE)}</bdi>
          </a>
        </span>
      </p>
    </div>
  );
}

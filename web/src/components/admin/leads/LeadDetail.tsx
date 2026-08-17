'use client';
/**
 * Lead detail — everything a sales rep needs for ONE deal on ONE screen: who
 * the customer is and how to call them, what they asked for (unit, weight,
 * money), where the deal stands in the funnel, and the single action that
 * moves it forward. Every mutation invalidates the CRM queries.
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { adminApi, type AdminLead, type AdminProforma } from '@/lib/api/resources/admin';
import { http } from '@/lib/api/http';
import type { LineItem, Order, PriceUnit } from '@/lib/types/domain';
import { useAuthStore } from '@/lib/stores/auth';
import { ROLE_LABEL, can, canChangeLeadAssignee } from '@/lib/auth/roles';
import type { Role } from '@/lib/auth/types';
import { formatToman, normalizeDigits, toPersianDigits } from '@/lib/utils/format';
import { formatJalali } from '@/lib/utils/jalali';
import { useToast } from '@/lib/hooks/useToast';
import { ApiError } from '@/lib/api/errors';
import { routes } from '@/lib/routes';
import { PhoneIcon } from '@/components/primitives/icons';
import { Alert, Badge, Button, EmptyState, Modal, Skeleton, useConfirm } from '@/components/ui';
import { JalaliDateField } from '../JalaliDateField';
import { CallOutcomeModal, type CallOutcomeResult } from './CallOutcomeModal';
import ui from '../adminUi.module.css';
import s from './LeadDetail.module.css';

/* ------------------------------------------------------------------ *
 * Route calls made here rather than through `adminApi`
 *
 * The three wrappers in `lib/api/resources/admin.ts` predate this sprint's
 * route contracts and cannot express them: `issueProforma` has no slot for the
 * `reissue` flag the 409 `proforma_active` gate demands and types the response
 * as `{ proforma }` alone (losing `smsSent`/`leadStatus`/`supersededRef`),
 * `convertToOrder` drops `smsSent`, and `updateLeadItem` cannot send
 * `unitPrice: null` — the route now REJECTS 0 because a stored 0 silently
 * dropped the line out of the customer's quote. The shapes below are the
 * routes' own documented contracts; fold them back into `admin.ts` when that
 * file is next edited.
 * ------------------------------------------------------------------ */

/** `AdminProforma` is missing the two columns this screen needs: a voided
 *  quote's `'cancelled'` status and the discount that was taken off. */
type ProformaView = Omit<AdminProforma, 'status'> & {
  status: 'active' | 'expired' | 'cancelled';
  discountToman?: number;
};

interface IssueProformaRes {
  proforma: ProformaView;
  smsSent: boolean;
  leadStatus: AdminLead['status'];
  requestSynced: boolean;
  supersededRef: string | null;
}

const issueProformaReq = (id: string, body: { discountToman?: number; reissue?: boolean }, idempotencyKey?: string) =>
  http.post<IssueProformaRes>(`/api/admin/leads/${encodeURIComponent(id)}/proforma`, body, {
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
  });

/** A fresh idempotency key for every DELIBERATE re-issue — without it the
 *  confirm dialog does nothing at all, at random.
 *
 *  `withIdempotency` keys an un-flagged POST on `${leadId}:${session}:${now/10s}`
 *  and stores the response WHATEVER its status — including the very 409
 *  `proforma_active` that opened the confirm. Retrying inside that same 10s
 *  bucket therefore replays the stored 409 (or a stored 201, showing the OLD
 *  ref) instead of running: the rep confirms «صدور مجدد», sees the same error,
 *  and concludes the panel is broken. A caller key is layered ON TOP of that
 *  scope (`route:fallback:header`), so a new one buys the re-issue its own row.
 *  Deliberately NOT sent on a first issue — there the 10s bucket is exactly
 *  what stops a double-click from minting two proformas and two SMS. */
function newIdempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `reissue-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const convertToOrderReq = (id: string) =>
  http.post<{ order: Order; smsSent: boolean }>(`/api/admin/leads/${encodeURIComponent(id)}/order`, {});

const updateLeadItemReq = (leadId: string, itemId: string, patch: { qty?: number; unitPrice?: number | null }) =>
  http.patch<{ item: LineItem & { id: string } }>(
    `/api/admin/leads/${encodeURIComponent(leadId)}/items/${encodeURIComponent(itemId)}`,
    patch,
  );

/* ------------------------------------------------------------------ */

/** The printable quote lives on the PUBLIC site (`/proforma/[ref]`), while the
 *  admin panel is served from panel.ahantime.com — so this must be absolute,
 *  and it must not be the literal production host: hardcoding it pointed every
 *  staging/preview rep at real customers' live documents. Same env + fallback
 *  pair `lib/seo.ts` uses. */
const proformaUrl = (ref: string) =>
  new URL(`/proforma/${encodeURIComponent(ref)}`, process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ahantime.com').toString();

const UNIT_LABEL: Record<PriceUnit, string> = {
  kg: 'کیلوگرم',
  branch: 'شاخه',
  sheet: 'برگ',
  meter: 'متر',
};

/** Mirrors `WHOLE_PIECE_UNITS` in leadsRepo — «۳٫۷ شاخه» is a typo, and the
 *  server rejects it; catching it here saves the rep a round trip. */
const WHOLE_PIECE_UNITS: readonly PriceUnit[] = ['branch', 'sheet'];

const SOURCE_LABEL: Record<string, string> = {
  table: 'جدول قیمت',
  ai: 'مشاور هوشمند',
  cart: 'سبد خرید',
  cooperation: 'همکاری',
  tool: 'ابزار',
  warehouse: 'انبار',
  contact: 'تماس',
};

const STATUS_META: Record<AdminLead['status'], { label: string; tone: 'info' | 'action' | 'gain' | 'loss' }> = {
  new: { label: 'جدید', tone: 'info' },
  contacted: { label: 'تماس‌گرفته', tone: 'action' },
  won: { label: 'موفق', tone: 'gain' },
  lost: { label: 'ناموفق', tone: 'loss' },
};

/** Where the deal actually is — `status` alone can't tell «تماس‌گرفته» from
 *  «تماس‌گرفته و پیش‌فاکتور در دست مشتری», which is the difference between the
 *  two most common next actions. */
type Stage = 'new' | 'contacted' | 'quoted' | 'won' | 'lost';

const STAGE_INDEX: Record<Stage, number> = { new: 0, contacted: 1, quoted: 2, won: 3, lost: 3 };

/** Persian-digit decimal with grouping. `formatToman` rounds to whole Toman,
 *  so it can't render qty/weight — those are doubles (۲٫۵ تن is a real
 *  quantity) and rounding them away is exactly the "۱۲ of what?" problem. */
function formatNum(value: number, maxFrac = 2): string {
  return toPersianDigits(value.toLocaleString('en-US', { maximumFractionDigits: maxFrac }))
    .replace(/,/g, '٬')
    .replace(/\./g, '٫');
}

/** The proforma money math, in ONE place, mirroring `issueProforma`
 *  (leads.service.ts) line for line:
 *
 *      subtotal  = Σ lineTotal of the PRICED lines
 *      discount  = clamp(discountToman, 0, subtotal)
 *      taxable   = subtotal − discount
 *      vatAmount = round(taxable × vatRate)
 *      total     = taxable + vatAmount
 *
 *  It used to be four inline expressions in the render body, which is how the
 *  preview a rep reads off the screen and the numbers the customer's document
 *  actually carries drift apart. The sum is over lines with a real unit price
 *  only — the server issues from `items.filter(i => i.unitPrice)`, so an
 *  unpriced line («قلم بدون قیمت») must not inflate the on-screen subtotal
 *  either. Everything is integer Toman; nothing here introduces a fraction.
 *
 *  `vatRate` defaults to 0 because this screen has no VAT rate before
 *  issuance (the server reads it from settings at issue time) — hence the
 *  preview stops at «مبلغ پیش از مالیات». Callers that DO know the rate get
 *  the same numbers the server will store. */
export function proformaTotals(
  items: ReadonlyArray<{ unitPrice?: number | null; lineTotal?: number | null }>,
  discountToman: number,
  vatRate = 0,
): { subtotal: number; discount: number; taxable: number; vatAmount: number; total: number } {
  const subtotal = items.reduce(
    (sum, it) => (it.unitPrice != null && it.unitPrice > 0 ? sum + (it.lineTotal ?? 0) : sum),
    0,
  );
  const requested = Number.isFinite(discountToman) ? discountToman : 0;
  const discount = Math.min(Math.max(requested, 0), subtotal);
  const taxable = subtotal - discount;
  const vatAmount = Math.round(taxable * vatRate);
  const total = taxable + vatAmount;
  return { subtotal, discount, taxable, vatAmount, total };
}

/** Same predicate the server uses (`status='active' AND validUntil > now()`):
 *  expiry is swept lazily, so a row can read 'active' up to 10 minutes after
 *  it has actually lapsed. */
function isActiveProforma(p: ProformaView): boolean {
  return p.status === 'active' && new Date(p.validUntil).getTime() > Date.now();
}

const PROFORMA_STATUS: Record<ProformaView['status'], { label: string; tone: 'gain' | 'stale' | 'loss' }> = {
  active: { label: 'فعال', tone: 'gain' },
  expired: { label: 'منقضی', tone: 'stale' },
  cancelled: { label: 'باطل‌شده', tone: 'loss' },
};

/**
 * The advisor conversation behind an AI lead — the whole reason the rep can
 * open the call knowing what was already discussed. It has been persisted into
 * `lead.context` since the AI funnel shipped and was never rendered anywhere,
 * so every AI lead reached the desk with no context at all. Collapsed by
 * default (a long chat must not push the money panel off the screen).
 */
function AdvisorChatContext({
  summary,
  transcript,
}: {
  summary?: string;
  transcript?: Array<{ role: string; content: string }>;
}) {
  if (!summary && (!transcript || transcript.length === 0)) return null;
  return (
    <details className={s.chatLog}>
      <summary className={s.chatSummary}>
        گفتگوی مشتری با مشاور هوشمند
        {transcript && transcript.length > 0 ? ` (${toPersianDigits(transcript.length)} پیام)` : ''}
      </summary>
      {summary ? <p className={s.chatGist}>خلاصهٔ گفتگو: {summary}</p> : null}
      {transcript?.map((m, i) => (
        <p key={i} className={s.chatTurn}>
          <span className={s.chatWho}>{m.role === 'user' ? 'مشتری' : 'مشاور'}:</span> {m.content}
        </p>
      ))}
    </details>
  );
}

/** One editable line item (US-19.4). Frozen once an active proforma exists —
 *  the quote in the customer's hand and the lead must not drift apart. */
function EditableItemRow({
  leadId,
  item,
  locked,
  onSaved,
}: {
  leadId: string;
  item: LineItem & { id: string; currentPrice: number | null };
  locked: boolean;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [qty, setQty] = useState(String(item.qty));
  // An unpriced item is an EMPTY box, never «۰» — see the null/zero note on
  // the mutation below.
  const [price, setPrice] = useState(item.unitPrice != null ? String(item.unitPrice) : '');

  const qtyNum = Number(normalizeDigits(qty));
  const rawPrice = normalizeDigits(price).trim();
  const priceNum = rawPrice === '' ? null : Number(rawPrice);
  const qtyValid =
    Number.isFinite(qtyNum) && qtyNum > 0 && (!WHOLE_PIECE_UNITS.includes(item.unit) || Number.isInteger(qtyNum));
  // 0 is rejected by the route on purpose: stored as a price it made
  // `lineTotal` 0 and the proforma's `filter(i => i.unitPrice)` then dropped
  // the whole line out of the customer's quote without a word.
  const priceValid = priceNum === null || (Number.isFinite(priceNum) && Number.isInteger(priceNum) && priceNum > 0);
  const dirty = qtyNum !== item.qty || priceNum !== (item.unitPrice ?? null);
  // Live, so the rep sees what the line will cost BEFORE saving — the stored
  // lineTotal is a lap behind while the boxes are dirty.
  const lineTotal = qtyValid && priceNum !== null ? Math.round(qtyNum * priceNum) : null;

  const save = useMutation({
    mutationFn: () => updateLeadItemReq(leadId, item.id, { qty: qtyNum, unitPrice: priceNum }),
    onSuccess: () => {
      toast.success('قلم به‌روزرسانی شد.');
      onSaved();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'به‌روزرسانی قلم ناموفق بود.'),
  });

  const invalidMessage = !qtyValid
    ? WHOLE_PIECE_UNITS.includes(item.unit)
      ? `مقدار برای واحد «${UNIT_LABEL[item.unit]}» باید عدد صحیح و بزرگ‌تر از صفر باشد.`
      : 'مقدار باید بزرگ‌تر از صفر باشد.'
    : !priceValid
      ? 'قیمت واحد باید عدد صحیح و بزرگ‌تر از صفر باشد؛ برای «بدون قیمت» کادر را خالی بگذارید.'
      : null;

  return (
    <>
      <tr className={dirty && !locked ? s.dirty : undefined}>
        <td className={s.itemName}>{item.name}</td>
        <td>{UNIT_LABEL[item.unit]}</td>
        <td>
          <input
            className={`${ui.numInput} ${s.qtyInput}`}
            inputMode="decimal"
            value={qty}
            disabled={locked}
            aria-invalid={!qtyValid || undefined}
            onChange={(e) => setQty(e.target.value)}
            aria-label={`مقدار ${item.name} به ${UNIT_LABEL[item.unit]}`}
          />
        </td>
        <td className={s.num}>{item.weightKg != null ? formatNum(item.weightKg) : '—'}</td>
        <td>
          <input
            className={`${ui.numInput} ${s.priceInput}`}
            inputMode="numeric"
            value={price}
            disabled={locked}
            aria-invalid={!priceValid || undefined}
            onChange={(e) => setPrice(e.target.value)}
            aria-label={`قیمت واحد ${item.name} به تومان`}
            placeholder="بدون قیمت"
          />
          {/* W23: this item's price was frozen at lead-creation time and
              issueProforma never re-prices it — see the note on GET
              /api/admin/leads/[id]. Surfacing the live catalog price here, next
              to the box the rep already uses to fix it, is the whole feature. */}
          {item.currentPrice != null && item.unitPrice != null && item.currentPrice !== item.unitPrice ? (
            <span className={s.priceDrift}>
              قیمت فعلی: {formatToman(item.currentPrice, false)}
            </span>
          ) : null}
        </td>
        <td className={s.num}>{lineTotal !== null ? formatToman(lineTotal, false) : '—'}</td>
        <td>
          {dirty && !locked ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={!qtyValid || !priceValid}
              loading={save.isPending}
              onClick={() => save.mutate()}
            >
              ذخیره
            </Button>
          ) : null}
        </td>
      </tr>
      {dirty && !locked && invalidMessage ? (
        <tr>
          <td colSpan={7} className={s.rowError}>
            {invalidMessage}
          </td>
        </tr>
      ) : null}
    </>
  );
}

export function LeadDetail({ id }: { id: string }) {
  const toast = useToast();
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [note, setNote] = useState('');
  const [discount, setDiscount] = useState('');
  const [lostOpen, setLostOpen] = useState(false);
  const [lostReason, setLostReason] = useState('');
  const [callOutcomeOpen, setCallOutcomeOpen] = useState(false);
  // The SMS outcome has to OUTLIVE the toast: sms.ir is 400-ing free-text
  // sends in production, and a rep who looks away for ten seconds must still
  // find out the customer was never told.
  //
  // Carries a `seq` purely to key the <Alert>: dismissing one keeps its own
  // `open:false` state, and because the element stays mounted while the text
  // is non-null, the NEXT failure would repaint into an invisible banner —
  // silently losing exactly the warning this state exists to deliver.
  const [smsAlert, setSmsAlert] = useState<{ seq: number; text: string } | null>(null);
  const warnSmsFailed = (text: string) => setSmsAlert((prev) => ({ seq: (prev?.seq ?? 0) + 1, text }));

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'lead', id],
    queryFn: () => adminApi.lead(id),
    // A 404 (archived lead, stale deep link) or a 403 is a permanent answer —
    // retrying it only prolongs the spinner the rep is staring at.
    retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
  });

  // Duplicate detection — exact normalised mobile only, within a recency
  // window (see findDuplicateLeads). Deliberately surfaced HERE and nowhere
  // else: a dedicated «duplicates» screen would invite bulk merging, which is
  // exactly the wrong ergonomic for an operation with no undo. A failure is
  // silent — the alert simply doesn't render — because a broken hint must
  // never block a rep from working the lead.
  const { data: dupData } = useQuery({
    queryKey: ['admin', 'lead', id, 'duplicates'],
    queryFn: () => adminApi.leadDuplicates(id),
    retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
  });

  const currentUser = useAuthStore((st) => st.user);
  const { data: staffData } = useQuery({ queryKey: ['admin', 'staff'], queryFn: () => adminApi.staff() });
  const staff = useMemo(() => staffData?.staff ?? [], [staffData]);
  // Notes carry only an authorId; on a shared lead «who wrote this?» is the
  // first question asked, and the staff list is already in cache for the
  // assignment picker.
  const staffNameById = useMemo(
    () => new Map(staff.map((m) => [m.id, m.name?.trim() || toPersianDigits(m.mobile)])),
    [staff],
  );
  const authorName = (authorId: string) =>
    staffNameById.get(authorId) ?? (authorId === currentUser?.id ? 'شما' : 'کارشناس نامشخص');

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['admin', 'lead', id] });
    void qc.invalidateQueries({ queryKey: ['admin', 'leads'] });
    void qc.invalidateQueries({ queryKey: ['admin', 'stats'] });
  };
  const showError = (err: unknown, fallback: string) =>
    toast.error(err instanceof ApiError ? err.message : fallback);

  const merge = useMutation({
    // Exactly one attempt: the server keys idempotency on
    // (winner, loser, actor) with no time bucket, but an automatic client
    // retry of an irreversible operation is not a behaviour worth having at
    // all — a refusal is thrown server-side and releases the claim, so a
    // deliberate second click still works.
    retry: 0,
    mutationFn: (loserId: string) => adminApi.mergeLead(id, loserId),
    onSuccess: (res) => {
      toast.success(
        `سرنخ ${res.loser.ref} در ${res.winner.ref} ادغام و بایگانی شد — ${toPersianDigits(res.moved.items)} قلم کالا، ${toPersianDigits(res.moved.notes)} یادداشت و ${toPersianDigits(res.moved.proformas)} پیش‌فاکتور منتقل شد.`,
      );
      invalidate();
      void qc.invalidateQueries({ queryKey: ['admin', 'lead', id, 'duplicates'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'my', 'desk'] });
    },
    onError: (e) => showError(e, 'ادغام سرنخ‌ها ناموفق بود.'),
  });

  const setStatus = useMutation({
    mutationFn: (status: string) => adminApi.updateLead(id, { status }),
    onSuccess: (_res, status) => {
      // Acknowledge explicitly — a badge repaint alone reads as "nothing
      // happened" (every sibling mutation here toasts).
      toast.success(
        status === 'won' ? 'سرنخ موفق ثبت شد. 🎉' : status === 'lost' ? 'سرنخ ناموفق ثبت شد.' : 'وضعیت به‌روزرسانی شد.',
      );
      invalidate();
    },
    onError: (e) => showError(e, 'تغییر وضعیت ناموفق بود.'),
  });
  const addNote = useMutation({
    mutationFn: (text: string) => adminApi.addLeadNote(id, text),
    onSuccess: () => {
      toast.success('یادداشت ثبت شد.');
      setNote('');
      invalidate();
    },
    onError: (e) => showError(e, 'ثبت یادداشت ناموفق بود.'),
  });

  const parsedDiscount = discount.trim() ? Number(normalizeDigits(discount)) : 0;
  const discountValid = Number.isFinite(parsedDiscount) && Number.isInteger(parsedDiscount) && parsedDiscount >= 0;

  const issue = useMutation({
    // Exactly one attempt per click: the key below is minted per mutationFn
    // call, so an automatic retry would mint a second one and defeat the
    // server-side de-duplication it is threading through.
    retry: 0,
    mutationFn: (vars: { reissue: boolean }) =>
      issueProformaReq(
        id,
        {
          discountToman: parsedDiscount > 0 ? parsedDiscount : undefined,
          reissue: vars.reissue || undefined,
        },
        vars.reissue ? newIdempotencyKey() : undefined,
      ),
    onSuccess: (res) => {
      setDiscount('');
      invalidate();
      const superseded = res.supersededRef ? ` پیش‌فاکتور قبلی ${res.supersededRef} باطل شد.` : '';
      const head = `پیش‌فاکتور ${res.proforma.ref} به مبلغ ${formatToman(res.proforma.total)} صادر شد.`;
      if (res.smsSent) {
        setSmsAlert(null);
        toast.success(`${head} پیامک برای مشتری ارسال شد.${superseded}`);
      } else {
        // Never «صادر و پیامک شد» on faith: the proforma is durably issued
        // (201, not an error) but the customer has NOT been told.
        toast.error(`${head} ارسال پیامک ناموفق بود.${superseded}`);
        warnSmsFailed(
          `پیش‌فاکتور ${res.proforma.ref} صادر شد، اما پیامک آن به مشتری نرسید. مبلغ و شمارهٔ پیش‌فاکتور را تلفنی اعلام کنید یا لینک آن را دستی بفرستید.`,
        );
      }
    },
    onError: async (err) => {
      // The lead already has an outstanding quote (our cache was stale, or a
      // colleague issued one). Re-issuing is legitimate but must be
      // deliberate — the server names the ref, we confirm, then retry flagged.
      if (err instanceof ApiError && err.code === 'proforma_active') {
        const ok = await confirm({
          title: 'صدور مجدد پیش‌فاکتور؟',
          body: err.message,
          confirmLabel: 'صدور مجدد و ابطال نسخهٔ قبلی',
        });
        if (ok) issue.mutate({ reissue: true });
        return;
      }
      showError(err, 'صدور پیش‌فاکتور ناموفق بود.');
    },
  });

  const convert = useMutation({
    mutationFn: () => convertToOrderReq(id),
    onSuccess: (res) => {
      invalidate();
      if (res.smsSent) {
        setSmsAlert(null);
        toast.success(`سفارش ${res.order.ref} ساخته شد و کد رهگیری برای مشتری پیامک شد.`);
      } else {
        toast.error(`سفارش ${res.order.ref} ساخته شد، اما ارسال پیامک ناموفق بود.`);
        warnSmsFailed(
          `سفارش ${res.order.ref} ثبت شد، اما پیامک کد رهگیری به مشتری نرسید. کد را تلفنی به مشتری اعلام کنید.`,
        );
      }
    },
    onError: (e) => showError(e, 'تبدیل به سفارش ناموفق بود.'),
  });

  const assign = useMutation({
    mutationFn: (assigneeId: string | null) => adminApi.updateLead(id, { assigneeId }),
    onSuccess: (_res, assigneeId) => {
      toast.success(assigneeId ? 'سرنخ واگذار شد.' : 'واگذاری برداشته شد.');
      invalidate();
      void qc.invalidateQueries({ queryKey: ['admin', 'my', 'desk'] });
    },
    onError: (e) => showError(e, 'واگذاری ناموفق بود.'),
  });
  const setCallback = useMutation({
    mutationFn: (callbackAt: string | null) => adminApi.updateLead(id, { callbackAt }),
    onSuccess: () => {
      toast.success('زمان تماس ثبت شد.');
      invalidate();
      void qc.invalidateQueries({ queryKey: ['admin', 'my', 'desk'] });
    },
    onError: (e) => showError(e, 'ثبت زمان تماس ناموفق بود.'),
  });

  if (isLoading) {
    return (
      <div className={ui.panel}>
        <div className={s.loading} role="status" aria-label="در حال بارگذاری سرنخ">
          <Skeleton height="4.5rem" />
          <Skeleton height="3rem" />
          <Skeleton height="14rem" />
        </div>
      </div>
    );
  }

  // `isLoading || !data` used to cover BOTH states, so a failed fetch (404 on a
  // bad id, offline, 500) left the panel spinning forever with no message and
  // no way out.
  if (isError || !data) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <div className={ui.panel}>
        <EmptyState
          size="inline"
          tone="error"
          headline={notFound ? 'سرنخ یافت نشد' : 'بارگذاری سرنخ ناموفق بود'}
          body={
            notFound
              ? 'این سرنخ حذف یا بایگانی شده است. ممکن است لینک قدیمی باشد.'
              : error instanceof ApiError
                ? error.message
                : 'ارتباط با سرور برقرار نشد. اتصال را بررسی کنید و دوباره تلاش کنید.'
          }
          primary={
            notFound
              ? { label: 'بازگشت به فهرست سرنخ‌ها', href: routes.admin.leads() }
              : { label: 'تلاش دوباره', onClick: () => void refetch() }
          }
        />
      </div>
    );
  }

  const { lead, items, notes } = data;
  const proformas: ProformaView[] = data.proformas;
  const activeProforma = proformas.find(isActiveProforma) ?? null;
  const latestProforma = proformas[0] ?? null; // proformasOfLead orders desc by createdAt
  const customerNote = (lead.context?.note as string | undefined) ?? '';

  const stage: Stage =
    lead.status === 'won' || lead.status === 'lost' ? lead.status : activeProforma ? 'quoted' : lead.status;
  const stageIndex = STAGE_INDEX[stage];

  const totalWeight = items.reduce((sum, it) => sum + (it.weightKg ?? 0), 0);
  const pricedCount = items.filter((it) => it.unitPrice != null && it.unitPrice > 0).length;
  const {
    subtotal,
    discount: appliedDiscount,
    taxable,
  } = proformaTotals(items, discountValid ? parsedDiscount : 0);

  const itemsLocked = Boolean(activeProforma);
  const canIssue = pricedCount > 0 && lead.status !== 'lost';

  // Ownership controls, asked of the shared rule rather than re-derived here.
  // `currentUser` is null while the session hydrates, and `can()` fails closed
  // on a missing role — so the first paint hides these rather than flashing a
  // control the rep may not be allowed to use.
  const canManageLeads = can(currentUser?.role, 'leads:manage');
  const actorId = currentUser?.id ?? null;
  const actor = { id: actorId ?? '', role: currentUser?.role };
  const canClaim =
    actorId !== null && lead.assigneeId !== actorId && canChangeLeadAssignee(actor, lead.assigneeId, actorId);
  const canRelease =
    actorId !== null && lead.assigneeId !== null && canChangeLeadAssignee(actor, lead.assigneeId, null);

  // The single place a call's outcome turns into lead state. Declined hands
  // off to the existing lost-reason modal rather than duplicating its
  // reason-picker — one place asks «چرا نرفت», not two.
  const onCallOutcomeSubmit = (result: CallOutcomeResult) => {
    setCallOutcomeOpen(false);
    addNote.mutate(result.note);
    if (result.outcome === 'declined') {
      setLostReason('منصرف شد');
      setLostOpen(true);
      return;
    }
    if (lead.status === 'new') setStatus.mutate('contacted');
    if (result.outcome === 'later' && result.callbackAt) setCallback.mutate(result.callbackAt);
  };

  /* ---------------- duplicate leads ---------------- */

  const duplicates = dupData?.candidates ?? [];
  const dupWindowDays = dupData?.windowDays ?? 30;
  // Same predicate on both halves of the precondition the server enforces:
  // the merge is refused when EITHER lead carries an active proforma.
  const subjectBlockedByProforma = Boolean(activeProforma) || (dupData?.subjectHasActiveProforma ?? false);
  const staffLabel = (assigneeId: string | null) =>
    assigneeId ? (staffNameById.get(assigneeId) ?? 'کارشناس نامشخص') : 'بدون کارشناس';

  /** Follows the codebase's own standard for a destructive confirm (see
   *  CatalogManager's «Deactivation states its blast radius first»): name every
   *  row that moves, name the archive, name the other rep whose desk this lead
   *  is currently on, and say plainly that there is no undo. Nothing about
   *  `assigneeId`, `status`, `callbackAt` or `context` is merged — the winner
   *  keeps its own — so the dialog reports the loser's assignee rather than
   *  silently taking a lead off someone's desk. */
  const askMerge = async (c: (typeof duplicates)[number]) => {
    const ok = await confirm({
      title: `ادغام سرنخ ${c.ref} در ${lead.ref}؟`,
      body: (
        <div className={s.dupConfirm}>
          <span>
            {toPersianDigits(c.itemCount)} قلم کالا، {toPersianDigits(c.noteCount)} یادداشت و{' '}
            {toPersianDigits(c.proformaCount)} پیش‌فاکتور به <bdi>{lead.ref}</bdi> منتقل می‌شود و{' '}
            <bdi>{c.ref}</bdi> بایگانی خواهد شد.
          </span>
          {c.assigneeId !== lead.assigneeId ? (
            <span>
              سرنخ <bdi>{c.ref}</bdi> روی میز «{staffLabel(c.assigneeId)}» است. کارشناس مسئول این سرنخ («
              {staffLabel(lead.assigneeId)}») تغییر نمی‌کند — در صورت نیاز خودتان به همکارتان اطلاع دهید.
            </span>
          ) : null}
          <span className={s.dupWarn}>این عمل قابل بازگشت نیست؛ هیچ راهی برای جداکردن دوبارهٔ این دو سرنخ نیست.</span>
        </div>
      ),
      confirmLabel: 'ادغام و بایگانی',
    });
    if (ok) merge.mutate(c.id);
  };

  const steps: Array<{ label: string; hint: string }> = [
    { label: 'ثبت شد', hint: 'سرنخ جدید' },
    { label: 'تماس گرفته شد', hint: 'کارشناس تماس گرفت' },
    { label: 'پیش‌فاکتور صادر شد', hint: 'قیمت به مشتری اعلام شد' },
    stage === 'lost'
      ? { label: 'ناموفق', hint: 'معامله از دست رفت' }
      : { label: 'موفق', hint: 'معامله بسته شد' },
  ];

  return (
    <div className={ui.panel} onClick={(e) => e.stopPropagation()}>
      <div className={s.detail}>
        {/* Identity — the whole reason this panel exists. Reached from the
            desk, a notification or a shared link, the rep previously saw items
            and notes with no name, no phone and no ref. */}
        <header className={s.identity}>
          <div className={s.identityTop}>
            <h2 className={s.name}>{lead.contactName?.trim() || 'مشتری بدون نام'}</h2>
            <Badge tone={STATUS_META[lead.status].tone}>{STATUS_META[lead.status].label}</Badge>
            {lead.contactVerified ? <Badge tone="gain">شمارهٔ تأییدشده</Badge> : null}
            {/* tel: needs the raw Latin digits; the LABEL is Persian. */}
            <a
              className={s.tel}
              href={`tel:${normalizeDigits(lead.contactMobile)}`}
              aria-label={`تماس با ${lead.contactName?.trim() || 'مشتری'} — شمارهٔ ${toPersianDigits(lead.contactMobile)}`}
            >
              <PhoneIcon size={16} />
              <bdi className={s.ltr}>{toPersianDigits(lead.contactMobile)}</bdi>
            </a>
          </div>
          <div className={s.facts}>
            <span className={s.fact}>
              کد سرنخ:
              <bdi className={`${s.factValue} ${s.ltr}`}>{lead.ref}</bdi>
            </span>
            <span className={s.fact}>
              منبع:
              <span className={s.factValue}>{SOURCE_LABEL[lead.source] ?? lead.source}</span>
            </span>
            {lead.cooperationType ? (
              <span className={s.fact}>
                نوع همکاری:
                <span className={s.factValue}>{lead.cooperationType}</span>
              </span>
            ) : null}
            <span className={s.fact}>
              ثبت:
              <span className={`${s.factValue} ${s.ltr}`}>{formatJalali(lead.createdAt, 'yyyy/MM/dd HH:mm')}</span>
            </span>
            {lead.callbackAt ? (
              <span className={s.fact}>
                تماس بعدی:
                <span className={`${s.factValue} ${s.ltr}`}>{formatJalali(lead.callbackAt)}</span>
              </span>
            ) : null}
          </div>
        </header>

        {/* Possible duplicate of this same customer — an inline warning on the
            lead itself, never a bulk «duplicates» screen. Matching is EXACT on
            the normalised mobile: no fuzzy name matching, because one false
            positive acted on merges two real customers' order trails and there
            is no undo. */}
        {duplicates.length > 0 ? (
          <Alert tone="warning" title="احتمال سرنخ تکراری">
            <p>
              {toPersianDigits(duplicates.length)} سرنخ دیگر از همین شماره، با فاصلهٔ کمتر از{' '}
              {toPersianDigits(dupWindowDays)} روز نسبت به این سرنخ، ثبت شده است. پیش از ادغام، هر دو را باز کنید و
              مطمئن شوید یک خرید هستند نه دو سفارش جدا.
            </p>
            <ul className={s.dupList}>
              {duplicates.map((c) => {
                const blocked = subjectBlockedByProforma || c.hasActiveProforma;
                return (
                  <li key={c.id} className={s.dupRow}>
                    <a className={s.link} href={`${routes.admin.leads()}/${encodeURIComponent(c.id)}`}>
                      <bdi>{c.ref}</bdi>
                    </a>
                    <Badge tone={STATUS_META[c.status].tone}>{STATUS_META[c.status].label}</Badge>
                    <span className={`${s.dupMeta} ${s.ltr}`}>{formatJalali(c.createdAt, 'yyyy/MM/dd HH:mm')}</span>
                    <span className={s.dupMeta}>
                      {toPersianDigits(c.itemCount)} قلم · {staffLabel(c.assigneeId)}
                    </span>
                    {canManageLeads ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={blocked}
                        loading={merge.isPending}
                        onClick={() => void askMerge(c)}
                      >
                        ادغام در این سرنخ
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {canManageLeads ? (
              (subjectBlockedByProforma || duplicates.some((c) => c.hasActiveProforma)) ? (
                <p className={s.dupMeta}>
                  تا وقتی روی یکی از این سرنخ‌ها پیش‌فاکتور فعال هست، ادغام ممکن نیست — ممکن است همین حالا در دست مشتری
                  باشد. ابتدا آن پیش‌فاکتور را باطل کنید یا بگذارید منقضی شود.
                </p>
              ) : null
            ) : (
              <p className={s.dupMeta}>ادغام سرنخ‌های تکراری فقط از عهدهٔ مدیر برمی‌آید.</p>
            )}
          </Alert>
        ) : null}

        {/* Funnel position, driven by real state (status + an unexpired
            proforma) rather than by which buttons happen to be rendered. */}
        <ol className={s.stepper} aria-label="مرحلهٔ سرنخ">
          {steps.map((step, i) => {
            const done = i < stageIndex;
            const current = i === stageIndex;
            const lostEnd = current && stage === 'lost';
            return (
              <li
                key={step.label}
                className={[s.step, done ? s.stepDone : '', current && !lostEnd ? s.stepCurrent : '', lostEnd ? s.stepLost : '']
                  .filter(Boolean)
                  .join(' ')}
                aria-current={current ? 'step' : undefined}
              >
                <span className={s.stepLabel}>
                  {toPersianDigits(i + 1)}. {step.label}
                </span>
                <span className={s.stepHint}>{step.hint}</span>
              </li>
            );
          })}
        </ol>

        {smsAlert ? (
          <Alert key={smsAlert.seq} tone="warning" title="پیامک به مشتری ارسال نشد" dismissible>
            {smsAlert.text}
          </Alert>
        ) : null}

        <div className={s.columns}>
          <div className={s.col}>
            <section className={s.section}>
              <div className={s.sectionHead}>
                <h3 className={s.h}>اقلام</h3>
                {itemsLocked ? <Badge tone="stale">قفل‌شده</Badge> : null}
              </div>
              {itemsLocked && activeProforma ? (
                <p className={s.hint}>
                  اقلام تا زمانی که پیش‌فاکتور {activeProforma.ref} فعال است قابل ویرایش نیستند؛ برای تغییر قیمت یا
                  مقدار، «صدور مجدد پیش‌فاکتور» را بزنید.
                </p>
              ) : null}
              {items.length === 0 ? (
                <p className={ui.muted}>بدون قلم کالا.</p>
              ) : (
                <div className={s.scroller}>
                  <table className={ui.table}>
                    <thead>
                      <tr>
                        <th scope="col">کالا</th>
                        <th scope="col">واحد</th>
                        <th scope="col">مقدار</th>
                        <th scope="col">وزن (کیلوگرم)</th>
                        <th scope="col">قیمت واحد (تومان)</th>
                        <th scope="col">مبلغ خط (تومان)</th>
                        <th scope="col">
                          <span className="visually-hidden">ذخیره</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it) => (
                        <EditableItemRow key={it.id} leadId={id} item={it} locked={itemsLocked} onSaved={invalidate} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {customerNote ? <p className={ui.muted}>یادداشت مشتری: {customerNote}</p> : null}

              <AdvisorChatContext summary={lead.context?.aiSummary} transcript={lead.context?.transcript} />

              {/* The rep used to SMS a price to the customer without the amount
                  ever appearing on screen. */}
              {items.length > 0 ? (
                <div className={s.summary}>
                  <div className={s.sumRow}>
                    <span className={s.sumLabel}>وزن کل</span>
                    <span className={s.sumValue}>{formatNum(totalWeight)} کیلوگرم</span>
                  </div>
                  <div className={s.sumRow}>
                    <span className={s.sumLabel}>جمع اقلام</span>
                    <span className={s.sumValue}>{formatToman(subtotal, false)}</span>
                  </div>
                  {appliedDiscount > 0 ? (
                    <div className={s.sumRow}>
                      <span className={s.sumLabel}>تخفیف</span>
                      <span className={s.sumValue}>−{formatToman(appliedDiscount, false)}</span>
                    </div>
                  ) : null}
                  <div className={`${s.sumRow} ${s.sumTotal}`}>
                    <span>مبلغ پیش از مالیات</span>
                    <span className={s.sumValue}>{formatToman(taxable, false)} تومان</span>
                  </div>
                  <p className={s.sumHint}>
                    {pricedCount < items.length
                      ? `${toPersianDigits(items.length - pricedCount)} قلم بدون قیمت است و در پیش‌فاکتور نمی‌آید. `
                      : ''}
                    مالیات بر ارزش افزوده و مبلغ نهایی هنگام صدور محاسبه و در کارت پیش‌فاکتور نمایش داده می‌شود.
                  </p>
                </div>
              ) : null}
            </section>

            <section className={s.section}>
              <h3 className={s.h}>پیش‌فاکتور</h3>
              {activeProforma ? (
                // The state the owner could never see: after issuing, the
                // screen looked untouched and the rep clicked again.
                <div className={`${s.card} ${s.cardIssued}`}>
                  <div className={s.sectionHead}>
                    <Badge tone="gain">صادر شده</Badge>
                    <a
                      className={s.link}
                      href={proformaUrl(activeProforma.ref)}
                      target="_blank"
                      rel="noopener"
                      title="نسخهٔ چاپی / PDF با سربرگ"
                    >
                      <bdi>{activeProforma.ref}</bdi>
                    </a>
                  </div>
                  <div className={s.sumRow}>
                    <span className={s.sumLabel}>جمع اقلام</span>
                    <span className={s.sumValue}>{formatToman(activeProforma.subtotal, false)}</span>
                  </div>
                  {activeProforma.discountToman ? (
                    <div className={s.sumRow}>
                      <span className={s.sumLabel}>تخفیف</span>
                      <span className={s.sumValue}>−{formatToman(activeProforma.discountToman, false)}</span>
                    </div>
                  ) : null}
                  <div className={s.sumRow}>
                    <span className={s.sumLabel}>
                      مالیات بر ارزش افزوده ({formatNum(activeProforma.vatRate * 100, 1)}٪)
                    </span>
                    <span className={s.sumValue}>{formatToman(activeProforma.vatAmount, false)}</span>
                  </div>
                  <div className={`${s.sumRow} ${s.sumTotal}`}>
                    <span>مبلغ نهایی</span>
                    <span className={s.sumValue}>{formatToman(activeProforma.total)}</span>
                  </div>
                  <p className={s.sumHint}>
                    اعتبار تا {formatJalali(activeProforma.validUntil)} · صدور{' '}
                    {formatJalali(activeProforma.createdAt, 'yyyy/MM/dd HH:mm')}
                  </p>
                </div>
              ) : latestProforma ? (
                <div className={`${s.card} ${s.cardStale}`}>
                  <div className={s.sectionHead}>
                    <Badge tone={PROFORMA_STATUS[latestProforma.status].tone}>
                      {PROFORMA_STATUS[latestProforma.status].label}
                    </Badge>
                    <bdi>{latestProforma.ref}</bdi>
                  </div>
                  <p className={s.sumHint}>
                    پیش‌فاکتور فعالی روی این سرنخ نیست. آخرین نسخه به مبلغ {formatToman(latestProforma.total)} تا{' '}
                    {formatJalali(latestProforma.validUntil)} اعتبار داشت.
                  </p>
                </div>
              ) : (
                <p className={ui.muted}>هنوز پیش‌فاکتوری صادر نشده است.</p>
              )}

              {proformas.length > 1 ? (
                <details className={s.history}>
                  <summary>سوابق پیش‌فاکتورها ({toPersianDigits(proformas.length)})</summary>
                  <ul className={s.historyList}>
                    {proformas.map((p) => (
                      <li key={p.id} className={s.historyRow}>
                        <bdi>{p.ref}</bdi>
                        <span className={s.num}>{formatToman(p.total)}</span>
                        <span className={s.sumLabel}>اعتبار تا {formatJalali(p.validUntil)}</span>
                        <Badge tone={PROFORMA_STATUS[p.status].tone}>{PROFORMA_STATUS[p.status].label}</Badge>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </section>

            <section className={s.section}>
              <h3 className={s.h}>اقدام بعدی</h3>
              {/* One sentence naming where the deal stands, then ONE primary
                  button for what genuinely moves it forward next — everything
                  else (log another call, mark won/lost, reissue) is secondary.
                  Branches on `stage`, not raw `status`: `stage` already folds
                  in "has an active proforma", which is what actually decides
                  whether صدور/تبدیل is the next step. */}
              <div className={s.actions}>
                {stage === 'lost' ? (
                  <>
                    <p className={s.hint}>این سرنخ ناموفق ثبت شده است؛ برای ادامهٔ کار ابتدا آن را بازگشایی کنید.</p>
                    <Button
                      size="sm"
                      loading={setStatus.isPending}
                      onClick={async () => {
                        const ok = await confirm({
                          title: 'بازگشایی سرنخ؟',
                          body: 'سرنخ به وضعیت «تماس‌گرفته» برمی‌گردد و دوباره در جریان پیگیری قرار می‌گیرد.',
                          confirmLabel: 'بازگشایی',
                        });
                        if (ok) setStatus.mutate('contacted');
                      }}
                    >
                      بازگشایی
                    </Button>
                  </>
                ) : stage === 'won' ? (
                  <>
                    <p className={s.hint}>این سرنخ موفق ثبت شده است.</p>
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={setStatus.isPending}
                      onClick={async () => {
                        const ok = await confirm({
                          title: 'بازگشایی سرنخ؟',
                          body: 'سرنخ به وضعیت «تماس‌گرفته» برمی‌گردد و دوباره در جریان پیگیری قرار می‌گیرد.',
                          confirmLabel: 'بازگشایی',
                        });
                        if (ok) setStatus.mutate('contacted');
                      }}
                    >
                      بازگشایی
                    </Button>
                  </>
                ) : stage === 'new' ? (
                  <>
                    <p className={s.hint}>این سرنخ هنوز تماس گرفته نشده — همین حالا تماس بگیرید.</p>
                    <Button size="sm" onClick={() => setCallOutcomeOpen(true)}>
                      ثبت نتیجهٔ تماس
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setStatus.mutate('won')} loading={setStatus.isPending}>
                      موفق
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setLostOpen(true)}>
                      ناموفق
                    </Button>
                  </>
                ) : stage === 'contacted' && !canIssue ? (
                  <>
                    <p className={s.hint}>برای صدور پیش‌فاکتور، دست‌کم یک قلم باید قیمت داشته باشد.</p>
                    <Button size="sm" variant="secondary" onClick={() => setCallOutcomeOpen(true)}>
                      ثبت تماس دیگر
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setStatus.mutate('won')} loading={setStatus.isPending}>
                      موفق
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setLostOpen(true)}>
                      ناموفق
                    </Button>
                  </>
                ) : stage === 'contacted' ? (
                  <>
                    <p className={s.hint}>اقلام قیمت‌گذاری شده — برای ادامه، پیش‌فاکتور صادر کنید.</p>
                    <div className={s.field}>
                      <label className={s.fieldLabel} htmlFor={`discount-${id}`}>
                        تخفیف (تومان)
                      </label>
                      <input
                        id={`discount-${id}`}
                        className={ui.numInput}
                        inputMode="numeric"
                        placeholder="۰"
                        value={discount}
                        aria-invalid={!discountValid || undefined}
                        onChange={(e) => setDiscount(e.target.value)}
                      />
                    </div>
                    <Button
                      size="sm"
                      disabled={!discountValid}
                      loading={issue.isPending}
                      onClick={async () => {
                        // Issuing SMSes the customer immediately — never one
                        // stray click, and never without naming the amount.
                        const ok = await confirm({
                          title: 'صدور پیش‌فاکتور؟',
                          body: `پیش‌فاکتوری به مبلغ ${formatToman(taxable)} (پیش از مالیات) برای ${lead.contactName?.trim() || 'مشتری'} صادر و همان لحظه پیامک می‌شود.`,
                          confirmLabel: 'صدور و ارسال پیامک',
                        });
                        if (ok) issue.mutate({ reissue: false });
                      }}
                    >
                      صدور پیش‌فاکتور
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setCallOutcomeOpen(true)}>
                      ثبت تماس دیگر
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setStatus.mutate('won')} loading={setStatus.isPending}>
                      موفق
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setLostOpen(true)}>
                      ناموفق
                    </Button>
                  </>
                ) : (
                  // stage === 'quoted'
                  <>
                    <p className={s.hint}>پیش‌فاکتور برای مشتری پیامک شده — پس از تأیید مشتری، به سفارش تبدیل کنید.</p>
                    <Button
                      size="sm"
                      loading={convert.isPending}
                      onClick={async () => {
                        const ok = await confirm({
                          title: 'تبدیل به سفارش؟',
                          body: 'یک سفارش قابل رهگیری از این سرنخ ساخته و کد رهگیری برای مشتری پیامک می‌شود. این عمل قابل بازگشت نیست.',
                          confirmLabel: 'ساخت سفارش',
                        });
                        if (ok) convert.mutate();
                      }}
                    >
                      تبدیل به سفارش
                    </Button>
                    <div className={s.field}>
                      <label className={s.fieldLabel} htmlFor={`discount-${id}`}>
                        تخفیف مجدد (تومان)
                      </label>
                      <input
                        id={`discount-${id}`}
                        className={ui.numInput}
                        inputMode="numeric"
                        placeholder="۰"
                        value={discount}
                        aria-invalid={!discountValid || undefined}
                        onChange={(e) => setDiscount(e.target.value)}
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!discountValid}
                      loading={issue.isPending}
                      onClick={async () => {
                        const ok = await confirm({
                          title: 'صدور مجدد پیش‌فاکتور؟',
                          body: `پیش‌فاکتور فعلی (${activeProforma?.ref}) باطل و نسخهٔ تازه‌ای به مبلغ حدودی ${formatToman(taxable)} (پیش از مالیات) برای ${lead.contactName?.trim() || 'مشتری'} صادر و پیامک می‌شود.`,
                          confirmLabel: 'صدور مجدد و ابطال قبلی',
                        });
                        if (ok) issue.mutate({ reissue: true });
                      }}
                    >
                      صدور مجدد پیش‌فاکتور
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setCallOutcomeOpen(true)}>
                      ثبت تماس دیگر
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setStatus.mutate('won')} loading={setStatus.isPending}>
                      موفق
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setLostOpen(true)}>
                      ناموفق
                    </Button>
                  </>
                )}
              </div>
            </section>
          </div>

          <div className={s.col}>
            <section className={s.section}>
              <div className={s.sectionHead}>
                <h3 className={s.h}>یادداشت‌ها</h3>
                {isFetching ? <span className={ui.muted}>در حال به‌روزرسانی…</span> : null}
              </div>
              {notes.length === 0 ? (
                <p className={ui.muted}>یادداشتی نیست.</p>
              ) : (
                <ul className={s.notes}>
                  {notes.map((n) => (
                    <li key={n.id} className={s.note}>
                      <span className={s.noteMeta}>
                        <span className={s.noteAuthor}>{authorName(n.authorId)}</span>
                        <span className={s.ltr}>{formatJalali(n.at, 'yyyy/MM/dd HH:mm')}</span>
                      </span>
                      <p className={s.noteText}>{n.text}</p>
                    </li>
                  ))}
                </ul>
              )}
              <div className={s.noteForm}>
                <textarea
                  className={s.textarea}
                  placeholder="یادداشت کارشناس…"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  aria-label="یادداشت جدید"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!note.trim()}
                  onClick={() => note.trim() && addNote.mutate(note.trim())}
                  loading={addNote.isPending}
                >
                  ثبت یادداشت
                </Button>
              </div>
            </section>

            <section className={s.section}>
              <h3 className={s.h}>واگذاری و پیگیری</h3>
              <div className={s.assign}>
                {/* Who may move ownership is a server rule (canChangeLeadAssignee);
                    the UI asks that SAME function rather than re-deriving it, so a
                    button can never appear that the API would answer 403 to. */}
                {canClaim ? (
                  <Button size="sm" variant="secondary" onClick={() => assign.mutate(actorId)} loading={assign.isPending}>
                    سرنخ من
                  </Button>
                ) : null}
                {canRelease ? (
                  <Button size="sm" variant="ghost" onClick={() => assign.mutate(null)} loading={assign.isPending}>
                    رها کردن سرنخ
                  </Button>
                ) : null}
                {canManageLeads ? (
                  <div className={s.field}>
                    <label className={s.fieldLabel} htmlFor={`assignee-${id}`}>
                      کارشناس مسئول
                    </label>
                    <select
                      id={`assignee-${id}`}
                      className={ui.select}
                      value={lead.assigneeId ?? ''}
                      onChange={(e) => assign.mutate(e.target.value || null)}
                    >
                      <option value="">— بدون کارشناس —</option>
                      {staff.map((m) => (
                        <option key={m.id} value={m.id}>
                          {(m.name ?? m.mobile) + ' · ' + ROLE_LABEL[m.role as Role]}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className={s.field}>
                    <span className={s.fieldLabel}>کارشناس مسئول</span>
                    <span className={s.assigneeName}>
                      {lead.assigneeId
                        ? (staffNameById.get(lead.assigneeId) ?? 'کارشناس نامشخص')
                        : '— بدون کارشناس —'}
                    </span>
                  </div>
                )}
                <div className={s.field}>
                  <span className={s.fieldLabel}>زمان تماس بعدی</span>
                  <JalaliDateField
                    value={lead.callbackAt ? lead.callbackAt.slice(0, 10) : ''}
                    onChange={(iso) => setCallback.mutate(iso ? new Date(`${iso}T09:00:00`).toISOString() : null)}
                    label="زمان تماس بعدی (شمسی)"
                  />
                </div>
                {!canManageLeads ? (
                  <p className={s.hint}>
                    واگذاری سرنخ به کارشناس دیگر فقط از عهدهٔ مدیر سیستم برمی‌آید. شما می‌توانید سرنخ بدون کارشناس را
                    برای خودتان بردارید یا سرنخ خودتان را رها کنید.
                  </p>
                ) : null}
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* Lost-reason capture — the reason lands in the notes timeline (visible
          to the whole team + future reporting), then the status flips. */}
      <Modal
        open={lostOpen}
        onClose={() => setLostOpen(false)}
        title="ثبت سرنخ ناموفق"
        footer={
          <>
            <Button variant="ghost" onClick={() => setLostOpen(false)}>
              انصراف
            </Button>
            <Button
              loading={setStatus.isPending || addNote.isPending}
              onClick={async () => {
                if (lostReason.trim()) {
                  await adminApi.addLeadNote(id, `دلیل ناموفق: ${lostReason.trim()}`);
                }
                setStatus.mutate('lost');
                setLostOpen(false);
                setLostReason('');
              }}
            >
              ثبت ناموفق
            </Button>
          </>
        }
      >
        <div className={ui.toolbar}>
          {['قیمت بالاتر از رقبا', 'خرید از جای دیگر', 'منصرف شد', 'عدم پاسخ‌گویی'].map((r) => (
            <Button key={r} size="sm" variant={lostReason === r ? 'secondary' : 'ghost'} onClick={() => setLostReason(r)}>
              {r}
            </Button>
          ))}
        </div>
        <textarea
          className={s.textarea}
          placeholder="دلیل (اختیاری، برای گزارش‌گیری تیم)…"
          value={lostReason}
          onChange={(e) => setLostReason(e.target.value)}
          aria-label="دلیل ناموفق شدن سرنخ"
        />
      </Modal>

      <CallOutcomeModal
        open={callOutcomeOpen}
        onClose={() => setCallOutcomeOpen(false)}
        leadRef={lead.ref}
        contactName={lead.contactName}
        busy={addNote.isPending || setStatus.isPending || setCallback.isPending}
        onSubmit={onCallOutcomeSubmit}
      />
      {dialog}
    </div>
  );
}

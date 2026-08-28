'use client';
/**
 * SKU editor (W24, auto-fill pass).
 *
 * The admin is not technical, so the form asks only for the things that are
 * genuinely their decision — which sub-category, which size, which factory,
 * which grade — and derives everything else:
 *
 *  - the URL is composed from the product's own attributes
 *    (`rebar-14-a3-zobahan`) and is never presented as an input. It is not a
 *    transliteration of the Persian name, which would produce unreadable
 *    Finglish, and the server settles collisions by suffixing rather than
 *    handing back an error about a concept the admin has never heard of;
 *  - the display name is composed the way the catalog already reads;
 *  - theoretical weight comes from the standard d²/162 bar formula;
 *  - the unit defaults to how that category is actually sold.
 *
 * A derived field stays derived until the admin edits it by hand, at which
 * point it stops being recomputed — so a deliberate override is never
 * silently undone by a later size change.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useFocusTrap } from '@/lib/hooks/useFocusTrap';
import { adminApi, type AdminSku, type AdminCategory, type AdminSubCategory } from '@/lib/api/resources/admin';
import { ApiError } from '@/lib/api/errors';
import { normalizeDigits } from '@/lib/utils/format';
import {
  composeSkuName,
  composeSkuSlug,
  defaultPriceBasisFor,
  defaultUnitFor,
  theoreticalWeightFor,
} from '@/lib/utils/catalogCompose';
import {
  sizeLabel,
  weightLabel,
  usesDimensions,
  attrKeysFor,
  DIMENSIONS_LABEL,
  GRADE_LABEL,
  ALLOY_LABEL,
  STANDARD_LABEL,
  factoryIsMeaningful,
} from '@/lib/utils/catalogLabels';
import { useToast } from '@/lib/hooks/useToast';
import { Alert, Badge, Button, Heading, Text, useConfirm } from '@/components/ui';
import { TextInput, PickerInput } from '@/components/forms/fields';
import { ImageUpload } from '../ImageUpload';
import ui from '../adminUi.module.css';
import s from './catalog.module.css';

const UNITS: Array<{ v: AdminSku['unit']; label: string }> = [
  { v: 'kg', label: 'کیلوگرم' },
  { v: 'branch', label: 'شاخه' },
  { v: 'sheet', label: 'برگ' },
  { v: 'meter', label: 'متر' },
  // «عدد» — کوپلر و اتصالات، که وزن شاخه‌ای ندارند و تکی فروخته می‌شوند.
  { v: 'piece', label: 'عدد' },
  // «متر مربع» — ساندویچ‌پانل، که در همهٔ منابع با متر مربع اعلام می‌شود.
  { v: 'sqm', label: 'متر مربع' },
];

/**
 * «مبنای قیمت» — what the number typed into the pricing grid will be PER.
 *
 * Separate from «واحد فروش» above on purpose: those are two different facts
 * about a product and merging them is what left «۱۶٬۴۹۲٬۳۸۰ تومان / کیلوگرم»
 * on a copper pipe sold by the 15-metre coil. Almost every SKU is `kg`; the
 * field is prefilled from the sub-category and only ever needs touching for
 * the lines that really are quoted per whole item.
 */
const PRICE_BASES: Array<{ v: AdminSku['priceBasis']; label: string }> = [
  { v: 'kg', label: 'هر کیلوگرم' },
  { v: 'branch', label: 'هر شاخه' },
  { v: 'coil', label: 'هر کلاف' },
  { v: 'sheet', label: 'هر برگ' },
  { v: 'piece', label: 'هر عدد' },
  { v: 'sqm', label: 'هر متر مربع' },
];

/**
 * Example values shown inside the size field itself (not just the helper
 * text below it) so it reads as an ordinary typing box on first glance —
 * an admin who has only ever used closed dropdowns can otherwise miss that
 * a value outside the suggestion list is accepted too.
 */
const SIZE_PLACEHOLDER: Record<string, string> = {
  rebar: 'مثلاً ۱۴',
  ibeam: 'مثلاً ۱۴',
  'angle-channel': 'مثلاً ۱۰',
  wire: 'مثلاً ۶',
  pipe: 'مثلاً ۱ اینچ',
  profile: 'مثلاً ۴۰×۴۰',
  sheet: 'مثلاً ۲ میلی‌متر',
  'varagh-garm': 'مثلاً ۲ میلی‌متر',
  'varagh-sard': 'مثلاً ۰.۷ میلی‌متر',
  'varagh-steel': 'مثلاً ۱ میلی‌متر',
};
const FACTORY_PLACEHOLDER = 'مثلاً ذوب‌آهن اصفهان';
const GRADE_PLACEHOLDER = 'مثلاً A3';
const DIMENSIONS_PLACEHOLDER = 'مثلاً ۱۰۰۰×۲۰۰۰';

type Values = {
  name: string;
  slug: string;
  subCategoryId: string;
  size: string;
  factory: string;
  grade: string;
  /** ورق only — the plate's width×length. The field is not even rendered for
   *  other categories, but the value is still round-tripped so moving a SKU
   *  between categories never silently drops it. */
  dimensions: string;
  standard: string;
  unit: AdminSku['unit'];
  /** What a stored price is per — see PRICE_BASES. */
  priceBasis: AdminSku['priceBasis'];
  /** «طول شاخه/کلاف» in metres, free text so «۶» from a Persian keyboard is
   *  accepted; '' means "not recorded", which is a real and common answer. */
  branchLengthM: string;
  theoreticalWeightKg: string;
  imageUrl: string | null;
  /** Also list this product under «استیل», without a second row or a second
   *  URL — its subCategoryId above stays the one thing that decides those.
   *  See catalog.ts's crossListedCategoryIds doc comment. A plain checkbox
   *  rather than a general multi-select: «استیل» is the only cross-listing
   *  target that exists today, and this form already tries to read as few
   *  questions as possible. */
  crossListedSteel: boolean;
};

function toValues(sku: AdminSku | null, defaultSubId: string, steelCategoryId: string | undefined): Values {
  return {
    name: sku?.name ?? '',
    slug: sku?.slug ?? '',
    subCategoryId: sku?.subCategoryId ?? defaultSubId,
    size: sku?.size ?? '',
    factory: sku?.factory ?? '',
    grade: sku?.grade ?? '',
    dimensions: sku?.dimensions ?? '',
    standard: sku?.standard ?? '',
    unit: sku?.unit ?? 'kg',
    priceBasis: sku?.priceBasis ?? 'kg',
    branchLengthM: sku?.branchLengthM != null ? String(sku.branchLengthM) : '',
    theoreticalWeightKg: sku?.theoreticalWeightKg != null ? String(sku.theoreticalWeightKg) : '',
    imageUrl: sku?.imageUrl ?? null,
    crossListedSteel: Boolean(steelCategoryId && sku?.crossListedCategoryIds?.includes(steelCategoryId)),
  };
}

/** '' means "clear this column" (→ null); a value means "set it". */
const orNull = (v: string): string | null => (v.trim() === '' ? null : v.trim());

/**
 * «طول شاخه» as a number, or null when the field is empty or not a usable
 * length. Null on a bad value rather than NaN so the weight prefill quietly
 * falls back to the line's documented convention while the operator is still
 * mid-keystroke; `lengthValid` below is what actually blocks saving.
 */
const lengthNumOf = (raw: string): number | null => {
  const t = normText(raw).trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 && n <= 100 ? n : null;
};

/**
 * Latin-digit normalization for the digit-bearing free-text columns
 * (size, dimensions, factory, grade, standard, theoretical weight).
 *
 * Applied at the point a value is DERIVED FROM or SAVED — never while typing,
 * so the admin keeps seeing exactly the glyphs their keyboard produced. Same
 * failure mode as the weight field documented below, but with a longer fuse:
 * a size typed «۱۴» on a Persian layout used to be stored raw, so the stored
 * `size`, the auto-derived slug and the weight auto-fill were all keyed on
 * characters that nothing else in the catalog uses — the customer's weight
 * lookup came back empty, the URL degraded to `rebar--a3-zobahan`, and every
 * later string comparison against this SKU's size silently missed.
 *
 * «٫» (the Persian decimal separator) collapses to «.» too: it is what a
 * Persian layout produces for «۰٫۷ میلی‌متر», and `normalizeDigits` only
 * touches digits.
 */
const normText = (v: string): string => normalizeDigits(v).replace(/٫/g, '.');

export function SkuDrawer({
  sku,
  categories,
  subs,
  defaultSubId,
  onClose,
  onSaved,
}: {
  /** null = creating. */
  sku: AdminSku | null;
  categories: AdminCategory[];
  subs: AdminSubCategory[];
  defaultSubId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const steelCategory = useMemo(() => categories.find((c) => c.slug === 'steel'), [categories]);
  const initial = useMemo(
    () => toValues(sku, defaultSubId, steelCategory?.id),
    [sku, defaultSubId, steelCategory?.id],
  );
  const [v, setV] = useState<Values>(initial);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [advanced, setAdvanced] = useState(false);
  const firstFieldRef = useRef<HTMLSelectElement>(null);
  const isEdit = Boolean(sku);

  /**
   * Which fields the admin has taken over. An EXISTING product counts as fully
   * hand-authored: re-deriving its name or URL just because someone opened the
   * form would rewrite live data and break an indexed URL.
   */
  const [touched, setTouched] = useState({
    name: isEdit,
    slug: isEdit,
    weight: isEdit,
    unit: isEdit,
    basis: isEdit,
  });

  const dirty = useMemo(() => JSON.stringify(v) !== JSON.stringify(initial), [v, initial]);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const { confirm, dialog } = useConfirm();

  const selectedSub = subs.find((x) => x.id === v.subCategoryId);
  const parentCategory = categories.find((c) => c.id === selectedSub?.categoryId);
  // ورق products are described by thickness, not size — the admin sees the
  // word the trade actually uses for whichever category they're filing this
  // product under (see catalogLabels). The stored column is unchanged.
  const sizeCol = sizeLabel(parentCategory?.slug);
  const showDimensions = usesDimensions(parentCategory?.slug);
  // استیل — the whole category — and پروفیل استیل read `skus.grade` as «آلیاژ»
  // on the public pages, because on a stainless product the stored grade
  // genuinely IS the alloy (۲۰۱/۳۰۴/۳۰۴L/۳۱۶L). The admin box is relabelled to
  // match — an operator asked for a «گرید» and a product page publishing
  // «آلیاژ» is how the wrong value gets typed in. Deliberately narrow: it asks
  // catalogLabels rather than deciding for itself, so no other category's field
  // changes at all.
  const attrKeys = attrKeysFor(parentCategory?.slug, selectedSub?.slug ?? null);
  // تیرآهن هاش سبک/سنگین: «گرید» بی‌معناست، ستون واقعی همان skus.standard
  // است (مثلاً HEA/HEB بر اساس DIN 1025) — همان قاعده‌ای که آلیاژ استیل بالا
  // به آن اشاره دارد، این‌بار برای catalogLabels.attrKeysFor(...).includes('standard').
  const usesStandardAttr = attrKeys.includes('standard');
  const gradeLabel = attrKeys.includes('alloy')
    ? ALLOY_LABEL
    : usesStandardAttr
      ? STANDARD_LABEL
      : GRADE_LABEL;

  const { data: suggestions } = useQuery({
    queryKey: ['admin', 'cat', 'suggestions', parentCategory?.id ?? ''],
    queryFn: () => adminApi.catalogSuggestions(parentCategory?.id),
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  const requestClose = useCallback(async () => {
    if (!dirtyRef.current) {
      onClose();
      return;
    }
    const ok = await confirm({
      title: 'بستن بدون ذخیره',
      body: 'تغییرات ذخیره‌نشده از بین می‌رود. ادامه می‌دهید؟',
      confirmLabel: 'بستن و ازدست‌دادن تغییرات',
    });
    if (ok) onClose();
  }, [confirm, onClose]);

  /** The trap owns Esc, focus containment and focus restore. */
  const panelRef = useFocusTrap<HTMLDivElement>(true, () => void requestClose());

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  /** Re-derive everything the admin has not taken over. */
  const applyDerived = (next: Values, t: typeof touched): Values => {
    const sub = subs.find((x) => x.id === next.subCategoryId);
    const cat = categories.find((c) => c.id === sub?.categoryId);
    const out = { ...next };
    // Everything derived is derived from the NORMALIZED spelling — see normText.
    const size = normText(next.size);
    const factory = normalizeDigits(next.factory);
    const grade = normalizeDigits(next.grade);
    if (!t.name) {
      // The mill is folded into the display name only where the catalog
      // actually publishes one. On استیل and the fabricated-mill پروفیل subs
      // it does not (catalogLabels.factoryIsMeaningful), and auto-filling
      // «نبشی استیل ۲۰×۲۰ چین» would put the removed word straight back on the
      // product page through the one field the removal cannot reach. The
      // stored `factory` value itself is untouched, exactly as on the public
      // side.
      out.name = composeSkuName({
        subName: sub?.name,
        size,
        factory: factoryIsMeaningful(cat?.slug, sub?.slug) ? factory : '',
      });
    }
    if (!t.slug && cat) {
      out.slug = composeSkuSlug({
        categorySlug: cat.slug,
        size,
        grade,
        factory,
      });
    }
    if (!t.weight && cat) {
      // `sub` (not just `cat`): the section a weight formula needs is a
      // property of the sub-category — «نبشی» and «ناودانی» share a category
      // and are two different published tables.
      // The SKU's own «طول شاخه» wins over the line's convention — a نبشی
      // marked ۱۲ متری weighs exactly twice the 6 m default.
      const w = theoreticalWeightFor(cat.slug, size, sub?.slug, lengthNumOf(next.branchLengthM));
      out.theoreticalWeightKg = w != null ? String(w) : '';
    }
    // `sub` too: کوپلر is sold per «عدد» even though میلگرد defaults to «شاخه».
    if (!t.unit && cat) out.unit = defaultUnitFor(cat.slug, sub?.slug);
    if (!t.basis && cat) out.priceBasis = defaultPriceBasisFor(cat.slug, sub?.slug);
    return out;
  };

  const set = (patch: Partial<Values>, markTouched?: Partial<typeof touched>) => {
    const nextTouched = markTouched ? { ...touched, ...markTouched } : touched;
    if (markTouched) setTouched(nextTouched);
    setV((prev) => applyDerived({ ...prev, ...patch }, nextTouched));
    setFieldErrors((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(patch)) delete next[k];
      return next;
    });
  };

  // Persian keyboards produce «۱۴٫۵»; Number() of that is NaN, which reached
  // the server as null and came back as an unexplained 400.
  const weightRaw = normText(v.theoreticalWeightKg).trim();
  const weightNum = weightRaw === '' ? null : Number(weightRaw);
  const weightValid = weightNum === null || (Number.isFinite(weightNum) && weightNum > 0 && weightNum <= 100_000);
  // Same Persian-digit treatment as the weight above. 100 m is far past any
  // mill branch and 0 is not a length, so both are rejected rather than saved.
  const lengthRaw = normText(v.branchLengthM).trim();
  const lengthNum = lengthNumOf(v.branchLengthM);
  const lengthValid = lengthRaw === '' || lengthNum !== null;
  const canSave =
    v.name.trim() !== '' && Boolean(v.subCategoryId) && Boolean(v.slug) && weightValid && lengthValid;

  const save = useMutation({
    mutationFn: () => {
      const body = {
        subCategoryId: v.subCategoryId,
        slug: v.slug,
        name: v.name.trim(),
        // Normalized here, not on every keystroke — see normText.
        size: orNull(normText(v.size)),
        factory: orNull(normalizeDigits(v.factory)),
        grade: orNull(normalizeDigits(v.grade)),
        dimensions: orNull(normText(v.dimensions)),
        standard: orNull(normalizeDigits(v.standard)),
        unit: v.unit,
        priceBasis: v.priceBasis,
        branchLengthM: lengthNum,
        theoreticalWeightKg: weightNum,
        imageUrl: v.imageUrl,
        crossListedCategoryIds: v.crossListedSteel && steelCategory ? [steelCategory.id] : null,
      };
      return sku ? adminApi.updateSku(sku.id, body) : adminApi.createSku(body);
    },
    onSuccess: () => {
      toast.success(sku ? 'کالا ذخیره شد.' : 'کالا ساخته شد؛ از «قیمت‌گذاری» قیمتش را ثبت کنید.');
      onSaved();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.fields) setFieldErrors(err.fields);
      toast.error(err instanceof ApiError ? err.message : 'ذخیره ناموفق بود.');
    },
  });

  const groupedSubs = useMemo(() => {
    const byCat = new Map<string, AdminSubCategory[]>();
    for (const x of subs) {
      const list = byCat.get(x.categoryId) ?? [];
      list.push(x);
      byCat.set(x.categoryId, list);
    }
    return categories
      .filter((c) => byCat.has(c.id))
      .map((c) => ({ categoryId: c.id, categoryName: c.name, subs: byCat.get(c.id)! }));
  }, [subs, categories]);

  const moved = isEdit && sku!.subCategoryId !== v.subCategoryId;

  return (
    <>
      <div className={s.scrim} onClick={() => void requestClose()} aria-hidden="true" />
      <div
        className={s.drawer}
        role="dialog"
        aria-modal="true"
        aria-label={sku ? `ویرایش ${sku.name}` : 'کالای جدید'}
        ref={panelRef}
      >
        <div className={s.drawerHead}>
          <Heading level={2}>{sku ? 'ویرایش کالا' : 'کالای جدید'}</Heading>
          <div className={s.metaRow}>
            {parentCategory ? (
              <Text color="muted">
                {parentCategory.name} › {selectedSub?.name ?? '—'}
              </Text>
            ) : null}
            {sku ? sku.isActive ? <Badge tone="gain">فعال</Badge> : <Badge tone="stale">غیرفعال</Badge> : null}
          </div>
        </div>

        <div className={s.drawerBody}>
          <div>
            <div className={s.groupTitle}>مشخصات کالا</div>
            <div className={s.fieldGrid}>
              <div>
                <label className={ui.tileLabel} htmlFor="sku-sub">
                  زیر‌دسته
                </label>
                <select
                  id="sku-sub"
                  ref={firstFieldRef}
                  className={ui.select}
                  style={{ inlineSize: '100%' }}
                  value={v.subCategoryId}
                  onChange={(e) => set({ subCategoryId: e.target.value })}
                >
                  <option value="">انتخاب کنید…</option>
                  {groupedSubs.map((g) => (
                    <optgroup key={g.categoryId} label={g.categoryName}>
                      {g.subs.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                          {x.isActive ? '' : ' (غیرفعال)'}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                {moved ? (
                  <div className={ui.tileHintWarn}>
                    با جابه‌جایی، نشانی صفحهٔ کالا عوض می‌شود (انتقال خودکار ساخته می‌شود).
                  </div>
                ) : null}
              </div>

              <PickerInput
                id="sku-size"
                label={sizeCol}
                helper={`از فهرست انتخاب کنید یا ${sizeCol} تازه بنویسید.`}
                value={v.size}
                options={suggestions?.sizes ?? []}
                error={fieldErrors.size}
                maxLength={40}
                placeholder={SIZE_PLACEHOLDER[parentCategory?.slug ?? ''] ?? 'مثلاً ۱۴'}
                onChange={(size) => set({ size })}
              />
              {/* ورق only. A plate has three dimensions and `size` above holds
                  just the thickness — «ابعاد» is the width×length. Asking
                  میلگرد/تیرآهن/… for it would be a meaningless extra box, so
                  the field simply isn't rendered there. */}
              {showDimensions ? (
                <PickerInput
                  id="sku-dimensions"
                  label={DIMENSIONS_LABEL}
                  helper="عرض×طول ورق. اختیاری — اگر نمی‌دانید خالی بگذارید."
                  value={v.dimensions}
                  options={suggestions?.dimensions ?? []}
                  error={fieldErrors.dimensions}
                  maxLength={40}
                  placeholder={DIMENSIONS_PLACEHOLDER}
                  onChange={(dimensions) => set({ dimensions })}
                />
              ) : null}
              <PickerInput
                id="sku-factory"
                label="کارخانه"
                helper="از فهرست انتخاب کنید تا یک کارخانه دو اسم نشود."
                value={v.factory}
                options={suggestions?.factories ?? []}
                error={fieldErrors.factory}
                maxLength={80}
                placeholder={FACTORY_PLACEHOLDER}
                onChange={(factory) => set({ factory })}
              />
              <PickerInput
                id={usesStandardAttr ? 'sku-standard' : 'sku-grade'}
                label={gradeLabel}
                helper={
                  gradeLabel === ALLOY_LABEL
                    ? 'استیل: ۲۰۱، ۳۰۴، ۳۰۴L، ۳۱۶L. در صفحهٔ کالا به مشتری نشان داده می‌شود.'
                    : gradeLabel === STANDARD_LABEL
                      ? 'مثلاً HEA یا HEB (بر اساس DIN 1025). در صفحهٔ کالا به مشتری نشان داده می‌شود.'
                      : 'میلگرد: A1، A2، A3 · ورق: ST37، ST52. در صفحهٔ کالا به مشتری نشان داده می‌شود.'
                }
                value={usesStandardAttr ? v.standard : v.grade}
                options={(usesStandardAttr ? suggestions?.standards : suggestions?.grades) ?? []}
                error={usesStandardAttr ? fieldErrors.standard : fieldErrors.grade}
                maxLength={40}
                placeholder={usesStandardAttr ? undefined : GRADE_PLACEHOLDER}
                onChange={(val) => (usesStandardAttr ? set({ standard: val }) : set({ grade: val }))}
              />
            </div>
          </div>

          {/* Filled in automatically. Shown rather than hidden so the admin can
              see what will be saved — but nothing here needs touching for a
              normal product. */}
          <div>
            <div className={s.groupTitle}>پرشده به‌صورت خودکار</div>
            <div className={s.fieldGrid}>
              <TextInput
                label="نام کالا"
                helper={touched.name ? 'دستی ویرایش شده.' : `از زیر‌دسته، ${sizeCol}، گرید و کارخانه ساخته می‌شود.`}
                value={v.name}
                error={fieldErrors.name}
                maxLength={160}
                onChange={(e) => set({ name: e.target.value }, { name: true })}
              />
              <TextInput
                label="وزن تئوری (کیلوگرم)"
                inputMode="decimal"
                helper={
                  touched.weight
                    ? 'دستی ویرایش شده. ماشین‌حساب وزن مشتری از این عدد استفاده می‌کند.'
                    : 'برای میلگرد و کلاف از روی سایز حساب می‌شود؛ برای بقیه خالی می‌ماند.'
                }
                value={v.theoreticalWeightKg}
                error={
                  fieldErrors.theoreticalWeightKg ?? (weightValid ? undefined : 'عدد مثبت وارد کنید یا خالی بگذارید.')
                }
                onChange={(e) => set({ theoreticalWeightKg: e.target.value }, { weight: true })}
              />
              <div>
                <label className={ui.tileLabel} htmlFor="sku-unit-sel">
                  واحد فروش
                </label>
                <select
                  id="sku-unit-sel"
                  className={ui.select}
                  style={{ inlineSize: '100%' }}
                  value={v.unit}
                  onChange={(e) => set({ unit: e.target.value as AdminSku['unit'] }, { unit: true })}
                >
                  {UNITS.map((u) => (
                    <option key={u.v} value={u.v}>
                      {u.label}
                    </option>
                  ))}
                </select>
                <div className={ui.tileHint}>
                  {touched.unit ? 'دستی انتخاب شده.' : 'بر اساس نوع دسته انتخاب شد.'}
                </div>
              </div>
              <div>
                <label className={ui.tileLabel} htmlFor="sku-basis-sel">
                  مبنای قیمت
                </label>
                <select
                  id="sku-basis-sel"
                  className={ui.select}
                  style={{ inlineSize: '100%' }}
                  value={v.priceBasis}
                  onChange={(e) =>
                    set({ priceBasis: e.target.value as AdminSku['priceBasis'] }, { basis: true })
                  }
                >
                  {PRICE_BASES.map((b) => (
                    <option key={b.v} value={b.v}>
                      {b.label}
                    </option>
                  ))}
                </select>
                <div className={ui.tileHint}>
                  قیمتی که در «قیمت‌گذاری» وارد می‌کنید، به ازای همین مبنا است.
                </div>
              </div>
              <TextInput
                label="طول شاخه (متر)"
                name="branchLengthM"
                inputMode="decimal"
                placeholder="مثلاً ۶"
                helper={`اختیاری. اگر ثبت شود، ${weightLabel(parentCategory?.slug)} بر همین طول حساب می‌شود.`}
                value={v.branchLengthM}
                error={
                  fieldErrors.branchLengthM ??
                  (lengthValid ? undefined : 'عدد مثبت وارد کنید یا خالی بگذارید.')
                }
                onChange={(e) => set({ branchLengthM: e.target.value }, { weight: touched.weight })}
              />
            </div>
            <div className={s.slugPreview} style={{ marginBlockStart: 'var(--space-2)' }}>
              نشانی صفحه: /prices/{parentCategory?.slug ?? '…'}/{selectedSub?.slug ?? '…'}/{v.slug || '…'}
            </div>
          </div>

          <div>
            <ImageUpload label="تصویر کالا" value={v.imageUrl} onChange={(imageUrl) => set({ imageUrl })} />
          </div>

          {/* The fields a normal product never needs, so the form reads as four
              questions rather than nine. */}
          <div>
            <Button size="sm" variant="ghost" aria-expanded={advanced} onClick={() => setAdvanced((x) => !x)}>
              {advanced ? 'بستن تنظیمات پیشرفته' : 'تنظیمات پیشرفته'}
            </Button>
            {advanced ? (
              <div style={{ marginBlockStart: 'var(--space-3)', display: 'grid', gap: 'var(--space-3)' }}>
                {!usesStandardAttr ? (
                  <PickerInput
                    id="sku-standard"
                    label="استاندارد"
                    helper="مثلاً ISIRI 3132 یا DIN 1025. اگر نمی‌دانید خالی بگذارید."
                    value={v.standard}
                    options={suggestions?.standards ?? []}
                    error={fieldErrors.standard}
                    maxLength={40}
                    onChange={(standard) => set({ standard })}
                  />
                ) : null}
                {isEdit ? (
                  <Alert tone="warning">
                    نشانی فعلی در گوگل ثبت شده و ممکن است مشتریان ذخیره‌اش کرده باشند. با تغییر آن، انتقال خودکار از
                    نشانی قدیمی ساخته می‌شود تا لینک‌های قبلی نشکنند.
                  </Alert>
                ) : null}
                <TextInput
                  label="نشانی صفحه"
                  dir="ltr"
                  helper="خودکار ساخته می‌شود؛ فقط اگر دلیل خاصی دارید تغییرش دهید."
                  value={v.slug}
                  error={fieldErrors.slug}
                  maxLength={120}
                  onChange={(e) => set({ slug: e.target.value }, { slug: true })}
                />
                {steelCategory && parentCategory?.slug !== 'steel' ? (
                  <label style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-start' }}>
                    <input
                      type="checkbox"
                      checked={v.crossListedSteel}
                      onChange={(e) => set({ crossListedSteel: e.target.checked })}
                      style={{ marginBlockStart: 4 }}
                    />
                    <span>
                      این کالا از جنس استیل است — همچنین در دستهٔ «استیل» هم نمایش داده شود
                      <div className={ui.tileHint}>نشانی صفحه همین یکی می‌ماند؛ فقط در فهرست «استیل» هم دیده می‌شود.</div>
                    </span>
                  </label>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className={s.drawerFoot}>
          <Button onClick={() => save.mutate()} disabled={!canSave || (isEdit && !dirty)} loading={save.isPending}>
            ذخیره
          </Button>
          <Button variant="ghost" onClick={() => void requestClose()}>
            انصراف
          </Button>
          {dirty ? <span className={`${ui.tileHint} ${s.footSpacer}`}>تغییرات ذخیره‌نشده</span> : null}
        </div>
      </div>
      {dialog}
    </>
  );
}

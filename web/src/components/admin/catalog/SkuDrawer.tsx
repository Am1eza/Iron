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
import { composeSkuName, composeSkuSlug, defaultUnitFor, theoreticalWeightFor } from '@/lib/utils/catalogCompose';
import { useToast } from '@/lib/hooks/useToast';
import { Alert, Badge, Button, Heading, Text, useConfirm } from '@/components/ui';
import { TextInput } from '@/components/forms/fields';
import { ImageUpload } from '../ImageUpload';
import ui from '../adminUi.module.css';
import s from './catalog.module.css';

const UNITS: Array<{ v: AdminSku['unit']; label: string }> = [
  { v: 'kg', label: 'کیلوگرم' },
  { v: 'branch', label: 'شاخه' },
  { v: 'sheet', label: 'برگ' },
  { v: 'meter', label: 'متر' },
];

type Values = {
  name: string;
  slug: string;
  subCategoryId: string;
  size: string;
  factory: string;
  grade: string;
  standard: string;
  unit: AdminSku['unit'];
  theoreticalWeightKg: string;
  imageUrl: string | null;
};

function toValues(sku: AdminSku | null, defaultSubId: string): Values {
  return {
    name: sku?.name ?? '',
    slug: sku?.slug ?? '',
    subCategoryId: sku?.subCategoryId ?? defaultSubId,
    size: sku?.size ?? '',
    factory: sku?.factory ?? '',
    grade: sku?.grade ?? '',
    standard: sku?.standard ?? '',
    unit: sku?.unit ?? 'kg',
    theoreticalWeightKg: sku?.theoreticalWeightKg != null ? String(sku.theoreticalWeightKg) : '',
    imageUrl: sku?.imageUrl ?? null,
  };
}

/** '' means "clear this column" (→ null); a value means "set it". */
const orNull = (v: string): string | null => (v.trim() === '' ? null : v.trim());

/** A datalist-backed text field — the admin picks an existing value instead of
 *  inventing a second spelling of it. */
function PickerInput({
  id,
  label,
  helper,
  value,
  options,
  error,
  maxLength,
  onChange,
}: {
  id: string;
  label: string;
  helper?: string;
  value: string;
  options: string[];
  error?: string;
  maxLength?: number;
  onChange: (v: string) => void;
}) {
  return (
    <>
      <TextInput
        label={label}
        list={`${id}-options`}
        helper={helper}
        value={value}
        error={error}
        maxLength={maxLength}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id={`${id}-options`}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </>
  );
}

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
  const initial = useMemo(() => toValues(sku, defaultSubId), [sku, defaultSubId]);
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
  const [touched, setTouched] = useState({ name: isEdit, slug: isEdit, weight: isEdit, unit: isEdit });

  const dirty = useMemo(() => JSON.stringify(v) !== JSON.stringify(initial), [v, initial]);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const { confirm, dialog } = useConfirm();

  const selectedSub = subs.find((x) => x.id === v.subCategoryId);
  const parentCategory = categories.find((c) => c.id === selectedSub?.categoryId);

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
    if (!t.name) {
      out.name = composeSkuName({ subName: sub?.name, size: next.size, grade: next.grade, factory: next.factory });
    }
    if (!t.slug && cat) {
      out.slug = composeSkuSlug({
        categorySlug: cat.slug,
        size: next.size,
        grade: next.grade,
        factory: next.factory,
      });
    }
    if (!t.weight && cat) {
      const w = theoreticalWeightFor(cat.slug, next.size);
      out.theoreticalWeightKg = w != null ? String(w) : '';
    }
    if (!t.unit && cat) out.unit = defaultUnitFor(cat.slug);
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
  const weightRaw = normalizeDigits(v.theoreticalWeightKg).replace('٫', '.').trim();
  const weightNum = weightRaw === '' ? null : Number(weightRaw);
  const weightValid = weightNum === null || (Number.isFinite(weightNum) && weightNum > 0 && weightNum <= 100_000);
  const canSave = v.name.trim() !== '' && Boolean(v.subCategoryId) && Boolean(v.slug) && weightValid;

  const save = useMutation({
    mutationFn: () => {
      const body = {
        subCategoryId: v.subCategoryId,
        slug: v.slug,
        name: v.name.trim(),
        size: orNull(v.size),
        factory: orNull(v.factory),
        grade: orNull(v.grade),
        standard: orNull(v.standard),
        unit: v.unit,
        theoreticalWeightKg: weightNum,
        imageUrl: v.imageUrl,
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
                label="سایز"
                helper="از فهرست انتخاب کنید یا سایز تازه بنویسید."
                value={v.size}
                options={suggestions?.sizes ?? []}
                error={fieldErrors.size}
                maxLength={40}
                onChange={(size) => set({ size })}
              />
              <PickerInput
                id="sku-factory"
                label="کارخانه"
                helper="از فهرست انتخاب کنید تا یک کارخانه دو اسم نشود."
                value={v.factory}
                options={suggestions?.factories ?? []}
                error={fieldErrors.factory}
                maxLength={80}
                onChange={(factory) => set({ factory })}
              />
              <PickerInput
                id="sku-grade"
                label="گرید"
                helper="میلگرد: A1، A2، A3 · ورق: ST37، ST52. در صفحهٔ کالا به مشتری نشان داده می‌شود."
                value={v.grade}
                options={suggestions?.grades ?? []}
                error={fieldErrors.grade}
                maxLength={40}
                onChange={(grade) => set({ grade })}
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
                helper={touched.name ? 'دستی ویرایش شده.' : 'از زیر‌دسته، سایز، گرید و کارخانه ساخته می‌شود.'}
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
                {isEdit ? (
                  <Alert tone="warning">
                    نشانی فعلی در گوگل ثبت شده و ممکن است مشتریان ذخیره‌اش کرده باشند. با تغییر آن، انتقال خودکار از
                    نشانی قدیمی ساخته می‌شود تا لینک‌های قبلی نشکنند.
                  </Alert>
                ) : null}
                <TextInput
                  label="نشانی صفحه (Slug)"
                  dir="ltr"
                  helper="خودکار ساخته می‌شود؛ فقط اگر دلیل خاصی دارید تغییرش دهید."
                  value={v.slug}
                  error={fieldErrors.slug}
                  maxLength={120}
                  onChange={(e) => set({ slug: e.target.value }, { slug: true })}
                />
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

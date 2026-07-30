'use client';
/**
 * SKU editor (W24) — a side drawer rather than the old inline card that
 * rendered BELOW the table, so clicking «ویرایش» on row 40 appeared to do
 * nothing. A drawer also keeps the row list readable while typing, which a
 * modal would cover.
 *
 * It owns the fixes the old form structurally could not have:
 *  - it is keyed by SKU id at the call site, so switching edit targets
 *    re-seeds the fields instead of writing row A's values onto row B;
 *  - an emptied box sends `null`, not `undefined`, so a wrong factory can
 *    actually be removed;
 *  - `standard`/`grade` exist at all (both are shown to customers);
 *  - the sub-category is a field, so a mis-filed product can be moved;
 *  - `err.fields` lands on the offending input instead of a generic toast.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { adminApi, type AdminSku, type AdminCategory, type AdminSubCategory } from '@/lib/api/resources/admin';
import { ApiError } from '@/lib/api/errors';
import { normalizeDigits } from '@/lib/utils/format';
import { slugify } from '@/lib/utils/slugify';
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
  const [slugUnlocked, setSlugUnlocked] = useState(!sku);
  const panelRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  const isEdit = Boolean(sku);
  const dirty = useMemo(() => JSON.stringify(v) !== JSON.stringify(initial), [v, initial]);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const { data: factoryData } = useQuery({
    queryKey: ['admin', 'cat', 'factories'],
    queryFn: adminApi.catalogFactories,
    staleTime: 5 * 60 * 1000,
  });

  const { confirm, dialog } = useConfirm();

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  /**
   * Every exit runs through here. The drawer used to hand Esc, the scrim and
   * «انصراف» straight to `onClose`, so a half-filled product form was thrown
   * away by a stray Esc with no prompt — the exact data-loss complaint the
   * audit raised against the old screen.
   */
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void requestClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [requestClose]);

  // Closing or reloading the tab mid-edit lost the form silently — the same
  // guard PricingGrid carries for its unsaved price drafts.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const set = (patch: Partial<Values>) => {
    setV((prev) => ({ ...prev, ...patch }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(patch)) delete next[k];
      return next;
    });
  };

  // Persian keyboards produce «۱۴٫۵»; Number() of that is NaN, which used to
  // reach the server as null and come back as an unexplained 400.
  const weightRaw = normalizeDigits(v.theoreticalWeightKg).replace('٫', '.').trim();
  const weightNum = weightRaw === '' ? null : Number(weightRaw);
  const weightValid = weightNum === null || (Number.isFinite(weightNum) && weightNum > 0 && weightNum <= 100_000);
  const slugValid = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v.slug);
  const canSave = v.name.trim() !== '' && slugValid && weightValid && Boolean(v.subCategoryId);

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
      // The server sends per-field Persian messages; the old form threw them
      // away and showed «ورودی نامعتبر است.» with no clue which field.
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

  const parentCategory = categories.find(
    (c) => c.id === subs.find((x) => x.id === v.subCategoryId)?.categoryId,
  );
  const moved = isEdit && sku!.subCategoryId !== v.subCategoryId;
  const slugChanged = isEdit && sku!.slug !== v.slug;

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
                {parentCategory.name} › {subs.find((x) => x.id === v.subCategoryId)?.name ?? '—'}
              </Text>
            ) : null}
            {sku ? (
              sku.isActive ? (
                <Badge tone="gain">فعال</Badge>
              ) : (
                <Badge tone="stale">غیرفعال</Badge>
              )
            ) : null}
          </div>
        </div>

        <div className={s.drawerBody}>
          <div>
            <div className={s.groupTitle}>هویت کالا</div>
            <div className={s.fieldGrid}>
              <TextInput
                ref={firstFieldRef}
                label="نام کالا"
                required
                helper="همان‌طور که مشتری در سایت می‌بیند. مثلاً: میلگرد ۱۴ آجدار A3 ذوب‌آهن"
                value={v.name}
                error={fieldErrors.name}
                maxLength={160}
                onChange={(e) => {
                  const name = e.target.value;
                  // Auto-slug ONLY while creating. In edit mode the old form
                  // kept this armed, so fixing a typo in a name silently
                  // rewrote the slug and 404'd every indexed URL.
                  set(isEdit ? { name } : { name, slug: slugify(name) });
                }}
              />
              <div>
                <label className={ui.tileLabel} htmlFor="sku-sub">
                  زیر‌دسته
                </label>
                <select
                  id="sku-sub"
                  className={ui.select}
                  style={{ inlineSize: '100%' }}
                  value={v.subCategoryId}
                  onChange={(e) => set({ subCategoryId: e.target.value })}
                >
                  <option value="">انتخاب کنید…</option>
                  {/* Grouped by category: opened from «همهٔ کالاها» this list is
                      every sub in the catalog, and sub names alone («ساده»,
                      «آجدار») repeat across categories — ungrouped they are
                      genuinely ambiguous. */}
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
                  <div className={ui.tileHintWarn}>با جابه‌جایی، نشانی صفحهٔ کالا عوض می‌شود (انتقال خودکار ساخته می‌شود).</div>
                ) : null}
              </div>
              <TextInput
                label="کارخانه"
                list="factory-options"
                helper="در جدول قیمت و مقایسهٔ کارخانه‌ها دیده می‌شود. از فهرست انتخاب کنید تا یک کارخانه دو اسم نشود."
                value={v.factory}
                error={fieldErrors.factory}
                maxLength={80}
                onChange={(e) => set({ factory: e.target.value })}
              />
              <datalist id="factory-options">
                {(factoryData?.factories ?? []).map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
              <TextInput
                label="سایز"
                helper="مثلاً میلگرد: ۱۴ · ورق: ۲ · قوطی: ۴۰×۴۰"
                value={v.size}
                error={fieldErrors.size}
                maxLength={40}
                onChange={(e) => set({ size: e.target.value })}
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
                  onChange={(e) => set({ unit: e.target.value as AdminSku['unit'] })}
                >
                  {UNITS.map((u) => (
                    <option key={u.v} value={u.v}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div>
            <div className={s.groupTitle}>مشخصات فنی</div>
            <div className={s.fieldGrid}>
              <TextInput
                label="گرید"
                helper="کیفیت فولاد. میلگرد: A1 ساده، A2/A3 آجدار. ورق: ST37، ST52. در صفحهٔ کالا به مشتری نشان داده می‌شود."
                value={v.grade}
                error={fieldErrors.grade}
                maxLength={40}
                onChange={(e) => set({ grade: e.target.value })}
              />
              <TextInput
                label="استاندارد"
                helper="استاندارد تولید، مثلاً ISIRI 3132 یا DIN 1025. اگر نمی‌دانید خالی بگذارید."
                value={v.standard}
                error={fieldErrors.standard}
                maxLength={40}
                onChange={(e) => set({ standard: e.target.value })}
              />
              <TextInput
                label="وزن تئوری (کیلوگرم)"
                inputMode="decimal"
                helper="وزن یک واحد فروش — مثلاً یک شاخهٔ ۱۲ متری میلگرد ۱۴ ≈ ۱۴٫۵ کیلوگرم. ماشین‌حساب وزن و برآورد هزینهٔ مشتری از همین عدد استفاده می‌کند."
                value={v.theoreticalWeightKg}
                error={fieldErrors.theoreticalWeightKg ?? (weightValid ? undefined : 'عدد مثبت وارد کنید یا خالی بگذارید.')}
                onChange={(e) => set({ theoreticalWeightKg: e.target.value })}
              />
            </div>
            <div style={{ marginBlockStart: 'var(--space-3)' }}>
              <ImageUpload label="تصویر کالا" value={v.imageUrl} onChange={(imageUrl) => set({ imageUrl })} />
            </div>
          </div>

          <div>
            <div className={s.groupTitle}>نشانی صفحه</div>
            {!slugUnlocked ? (
              <div className={s.metaRow}>
                <span className={s.slugPreview}>/prices/…/{v.slug}</span>
                <Button size="sm" variant="ghost" onClick={() => setSlugUnlocked(true)}>
                  تغییر نشانی
                </Button>
              </div>
            ) : (
              <>
                {isEdit ? (
                  <Alert tone="warning">
                    نشانی فعلی در گوگل ثبت شده و ممکن است مشتریان ذخیره‌اش کرده باشند. با تغییر آن، انتقال خودکار از
                    نشانی قدیمی ساخته می‌شود تا لینک‌های قبلی نشکنند.
                  </Alert>
                ) : null}
                <TextInput
                  label="نشانی (Slug)"
                  dir="ltr"
                  helper="فقط حروف کوچک انگلیسی، عدد و خط تیره."
                  value={v.slug}
                  error={fieldErrors.slug ?? (v.slug && !slugValid ? 'فقط حروف کوچک انگلیسی، عدد و خط تیره.' : undefined)}
                  maxLength={120}
                  onChange={(e) => set({ slug: e.target.value })}
                />
              </>
            )}
            {slugChanged ? <div className={ui.tileHintWarn}>نشانی تغییر کرده است.</div> : null}
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


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
import {
  adminApi,
  type AdminSku,
  type AdminCategory,
  type AdminSubCategory,
} from '@/lib/api/resources/admin';
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
  dimensionsLabel,
  attrKeysFor,
  GRADE_LABEL,
  ALLOY_LABEL,
  LENGTH_LABEL,
  CONDITION_LABEL,
  THICKNESS_LABEL,
  SIZE_LABEL,
  WIDTH_LABEL,
  FLANGE_LABEL,
  DIMENSIONS_LABEL,
  SCHEDULE_LABEL,
  BRAND_LABEL,
  STANDARD_LABEL,
  factoryIsMeaningful,
  factoryLabel,
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
/**
 * What the one shared `dimensions` box is asking for, keyed on the LABEL the
 * public table already resolved for this exact sub — not on the category.
 *
 * The category was the wrong key the moment one parent came to hold two
 * meanings for the field: under ورق, سیاه stores «۱۰۰۰×۲۰۰۰» while روغنی
 * stores a bare width, and under نبشی و ناودانی, نبشی stores a wall thickness
 * while وال‌پست stores a flange. Keying on the resolved label means the hint
 * cannot describe a different fact from the one written above the box —
 * `dimensionsLabel` is the single source both read (see `DIMENSION_MEANING`).
 *
 * `SIZE_LABEL` is the one label that is genuinely two facts (سیاه's mixed
 * width/width×length, اسیدشویی's bare width), so it is resolved per sub below.
 */
const DIMENSIONS_HINT: Record<string, { helper: string; placeholder: string }> = {
  [THICKNESS_LABEL]: {
    helper: 'ضخامت مقطع به میلی‌متر. اختیاری — اگر نمی‌دانید خالی بگذارید.',
    placeholder: 'مثلاً ۴',
  },
  [WIDTH_LABEL]: {
    helper: 'عرض ورق به میلی‌متر. اختیاری — اگر نمی‌دانید خالی بگذارید.',
    placeholder: 'مثلاً ۱۲۵۰',
  },
  [FLANGE_LABEL]: {
    helper: 'پهنای بال به میلی‌متر. اختیاری — اگر نمی‌دانید خالی بگذارید.',
    placeholder: 'مثلاً ۷',
  },
  [DIMENSIONS_LABEL]: {
    helper: 'عرض×طول ورق. اختیاری — اگر نمی‌دانید خالی بگذارید.',
    placeholder: 'مثلاً ۱۰۰۰×۲۰۰۰',
  },
};

/** ورق سیاه's «سایز» holds either shape; اسیدشویی's holds a bare width. */
const SHEET_SIZE_HINT: Record<string, { helper: string; placeholder: string }> = {
  black: {
    helper: 'عرض یا عرض×طول ورق. اختیاری — اگر نمی‌دانید خالی بگذارید.',
    placeholder: 'مثلاً ۱۲۵۰ یا ۱۰۰۰×۲۰۰۰',
  },
  pickled: DIMENSIONS_HINT[WIDTH_LABEL]!,
};

function dimensionsHint(
  categorySlug: string | undefined,
  subSlug: string | undefined,
  label: string,
): { helper: string; placeholder: string } {
  if (label === SIZE_LABEL && categorySlug === 'sheet' && subSlug && SHEET_SIZE_HINT[subSlug]) {
    return SHEET_SIZE_HINT[subSlug]!;
  }
  return DIMENSIONS_HINT[label] ?? DIMENSIONS_HINT[DIMENSIONS_LABEL]!;
}
const SCHEDULE_PLACEHOLDER = 'مثلاً ۴۰';
const BRAND_PLACEHOLDER = 'مثلاً چینی';

/**
 * What «برند» expects on مانیسمان — an ORIGIN, not a mill.
 *
 * A hard-coded list rather than `suggestions.factories`, which is the source
 * every other picker in this form uses. That list is scoped to the whole
 * parent CATEGORY, so under لوله it is precisely the set of Iranian mill
 * names — «لوله سپاهان», «تهران شرق», «سپنتا» — that this relabel exists to
 * stop an admin entering here; offering it beneath a «برند» label would push
 * them straight back to the values the owner asked us to move away from. The
 * sub's own stored values are no better: they are those same legacy mill
 * names, deliberately left un-backfilled.
 *
 * So until real برند values accumulate there is no honest data-derived list,
 * and these are the owner's own examples («چینی», «اروپایی») — UI guidance of
 * exactly the same kind as FACTORY_PLACEHOLDER above, not stored data. The
 * box stays free text, so an origin not listed here is still typeable.
 */
const BRAND_SUGGESTIONS = ['چینی', 'اروپایی', 'روسی', 'کره‌ای', 'ژاپنی', 'ترکیه‌ای'];

type Values = {
  name: string;
  slug: string;
  subCategoryId: string;
  size: string;
  factory: string;
  grade: string;
  /** Product form/finish. Independent from grade so one sheet can carry both
   *  an alloy and a supplied condition. */
  condition: string;
  /** ورق width×length or wall thickness on approved section subs. The field
   *  is hidden elsewhere, but still round-tripped so moving a SKU never
   *  silently drops it. */
  dimensions: string;
  /** «رده» — pipe schedule. Round-tripped like `dimensions` even where the
   *  field is not rendered, so moving a SKU between sub-categories never
   *  silently drops a recorded value. */
  schedule: string;
  standard: string;
  /** Position within this SKU's own factory-grouped section on the public
   *  price page. '' means "not ranked" (→ 0), same "empty box is a real,
   *  common answer" convention as branchLengthM/theoreticalWeightKg below. */
  order: string;
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

function toValues(
  sku: AdminSku | null,
  defaultSubId: string,
  steelCategoryId: string | undefined,
): Values {
  return {
    name: sku?.name ?? '',
    slug: sku?.slug ?? '',
    subCategoryId: sku?.subCategoryId ?? defaultSubId,
    size: sku?.size ?? '',
    factory: sku?.factory ?? '',
    grade: sku?.grade ?? '',
    condition: sku?.condition ?? '',
    dimensions: sku?.dimensions ?? '',
    schedule: sku?.schedule ?? '',
    standard: sku?.standard ?? '',
    order: sku?.order ? String(sku.order) : '',
    unit: sku?.unit ?? 'kg',
    priceBasis: sku?.priceBasis ?? 'kg',
    branchLengthM: sku?.branchLengthM != null ? String(sku.branchLengthM) : '',
    theoreticalWeightKg: sku?.theoreticalWeightKg != null ? String(sku.theoreticalWeightKg) : '',
    imageUrl: sku?.imageUrl ?? null,
    crossListedSteel: Boolean(
      steelCategoryId && sku?.crossListedCategoryIds?.includes(steelCategoryId),
    ),
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
  const sizeCol = sizeLabel(parentCategory?.slug, selectedSub?.slug ?? null);
  // The shared column means width×length for ورق and wall thickness for
  // exactly three نبشی subs. Passing `selectedSub.slug` is essential:
  // وال‌پست and تی‌بار share this parent and must remain untouched.
  const showDimensions = usesDimensions(parentCategory?.slug, selectedSub?.slug ?? null);
  const dimensionsCol = dimensionsLabel(parentCategory?.slug, selectedSub?.slug ?? null);
  // The admin uses the same AttrKey decision as the public page: استیل's
  // stored grade is an «آلیاژ», while supplied form/finish is edited through
  // the independent `condition` column. The legacy-condition key is limited
  // to families whose pre-migration grade is known to contain that fact.
  const attrKeys = attrKeysFor(parentCategory?.slug, selectedSub?.slug ?? null);
  // تیرآهن هاش سبک/سنگین: «گرید» بی‌معناست، ستون واقعی همان skus.standard
  // است (مثلاً HEA/HEB بر اساس DIN 1025) — همان قاعده‌ای که آلیاژ استیل بالا
  // به آن اشاره دارد، این‌بار برای catalogLabels.attrKeysFor(...).includes('standard').
  const usesStandardAttr = attrKeys.includes('standard');
  const usesAlloyAttr = attrKeys.includes('alloy');
  // وال‌پست (angle-channel): «گرید» is still the column being edited — only
  // the public label became «ضخامت» 1405/06/08, to match ahanonline. Same
  // `grade` field, same input, so it must keep resolving into this branch.
  const usesGradeAsThicknessAttr = attrKeys.includes('gradeAsThickness');
  // میلگرد (1405/06/09): the public column moved from «گرید» to «استاندارد»
  // to match ahanonline/teleahan, but it is still `skus.grade` underneath —
  // so, exactly like وال‌پست's «ضخامت» above, this must keep resolving into
  // the grade branch or the operator loses the only box that edits A2/A3.
  const usesGradeAsStandardAttr = attrKeys.includes('gradeAsStandard');
  // تسمه مسی: «حالت» whose value is stored in `skus.standard`, not in
  // `skus.condition` — the box has to write the field the page reads.
  const usesStandardAsConditionAttr = attrKeys.includes('standardAsCondition');
  const writesStandardAttr = usesStandardAttr || usesStandardAsConditionAttr;
  const usesGradeAttr =
    attrKeys.includes('grade') ||
    usesAlloyAttr ||
    usesGradeAsThicknessAttr ||
    usesGradeAsStandardAttr;
  const usesLegacyConditionAttr = attrKeys.includes('legacyCondition');
  const usesConditionAttr = attrKeys.includes('condition') || usesLegacyConditionAttr;
  // Some section families replace «گرید» with the name their source gives
  // the stored branch length: «حالت» on نبشی/ناودانی (`branch`) and on
  // industrial/furniture profile (`profileCondition` — same label, a
  // separate key only because the two categories' owner decisions were
  // made independently), and «طول» on galvanized profile (`length`). سپری
  // is deliberately NOT in this set — its own «طول شاخه» reads the
  // `branchLength` key instead and falls through to the generic automatic
  // input below, same as لوله/پروفیل صنعتی.
  //
  // The form must swap with the page, not merely alongside it. Leaving the
  // «گرید» box here while the public table no longer publishes grade for
  // these subs would invite an operator to keep filling a field nobody will
  // ever see — the same "collect exactly what is published" rule the آلیاژ
  // and استاندارد relabels above follow. Every key here reads the SAME
  // `branchLengthM` field; the old automatic input below is hidden so two
  // controls cannot write conflicting values into it. Nothing is stranded by
  // hiding it: `grade` is null on every live row of every one of these
  // families (وال‌پست, the one نبشی sub that does hold a real grade — now
  // edited as «ضخامت» via `usesGradeAttr` above — is deliberately not here).
  const branchAttrKey = attrKeys.find(
    (key) => key === 'branch' || key === 'profileCondition' || key === 'length',
  );
  const usesBranchAttr = Boolean(branchAttrKey);
  const branchAttrLabel =
    branchAttrKey === 'branch' || branchAttrKey === 'profileCondition'
      ? CONDITION_LABEL
      : LENGTH_LABEL;
  const gradeLabel = usesAlloyAttr
    ? ALLOY_LABEL
    : usesStandardAsConditionAttr
      ? CONDITION_LABEL
      : usesStandardAttr || usesGradeAsStandardAttr
        ? STANDARD_LABEL
        : usesGradeAsThicknessAttr
          ? THICKNESS_LABEL
          : GRADE_LABEL;
  // During rollout, old ورق rows still carry condition-shaped values in
  // grade. Display that value until the verified migration (or this edit)
  // moves it, but never use the fallback where grade is a real alloy.
  const legacyConditionFromGrade = usesLegacyConditionAttr && !v.condition && Boolean(v.grade);
  // «رده» is offered on exactly the لوله sub-categories whose products have a
  // schedule rating, decided by the same catalogLabels allow-list the public
  // table's column is built from — so the form can never collect a value the
  // page would then refuse to show, or vice versa.
  const showSchedule = attrKeysFor(parentCategory?.slug, selectedSub?.slug ?? null).includes(
    'schedule',
  );
  // «کارخانه», or «برند» on مانیسمان — where the product is imported and the
  // honest value is an origin rather than a mill (see catalogLabels'
  // factoryLabel). Relabelling the ADMIN box is the half that actually
  // changes what gets stored: an operator asked for a «کارخانه» types a mill
  // name, whatever the public page later calls the column.
  const factoryCol = factoryLabel(parentCategory?.slug, selectedSub?.slug ?? null);
  const isBrand = factoryCol === BRAND_LABEL;

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
    const condition = normalizeDigits(next.condition);
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
        condition,
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
  const weightValid =
    weightNum === null || (Number.isFinite(weightNum) && weightNum > 0 && weightNum <= 100_000);
  // Same Persian-digit treatment as the weight above. 100 m is far past any
  // mill branch and 0 is not a length, so both are rejected rather than saved.
  const lengthRaw = normText(v.branchLengthM).trim();
  const lengthNum = lengthNumOf(v.branchLengthM);
  const lengthValid = lengthRaw === '' || lengthNum !== null;
  // Empty box = 0 = "not ranked" — same value a SKU nobody has ranked
  // already carries, so leaving this untouched is a no-op save.
  const orderRaw = normText(v.order).trim();
  const orderNum = orderRaw === '' ? 0 : Number(orderRaw);
  const orderValid = Number.isInteger(orderNum) && orderNum >= 0 && orderNum <= 10_000;
  const canSave =
    v.name.trim() !== '' &&
    Boolean(v.subCategoryId) &&
    Boolean(v.slug) &&
    weightValid &&
    lengthValid &&
    orderValid;

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
        condition: orNull(normalizeDigits(v.condition)),
        dimensions: orNull(normText(v.dimensions)),
        schedule: orNull(normText(v.schedule)),
        standard: orNull(normalizeDigits(v.standard)),
        unit: v.unit,
        priceBasis: v.priceBasis,
        branchLengthM: lengthNum,
        theoreticalWeightKg: weightNum,
        order: orderNum,
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
              {/* One shared stored column, offered only where a source says
                  what it means there: ورق's width (or سیاه's width×length),
                  the wall thickness of every section family that publishes
                  one, and وال‌پست's «بال». The label AND the hint both come
                  from `dimensionsLabel`, so the box can never ask for one fact
                  under the name of another. */}
              {showDimensions ? (
                <PickerInput
                  id="sku-dimensions"
                  label={dimensionsCol}
                  helper={
                    dimensionsHint(parentCategory?.slug, selectedSub?.slug, dimensionsCol).helper
                  }
                  value={v.dimensions}
                  options={suggestions?.dimensions ?? []}
                  error={fieldErrors.dimensions}
                  maxLength={40}
                  placeholder={
                    dimensionsHint(parentCategory?.slug, selectedSub?.slug, dimensionsCol)
                      .placeholder
                  }
                  onChange={(dimensions) => set({ dimensions })}
                />
              ) : null}
              {/* «رده» — لوله's pressure-pipe subs only. مبلی and داربستی
                  have no schedule rating at all, so the box is not rendered
                  there rather than being rendered and left permanently
                  empty. */}
              {showSchedule ? (
                <PickerInput
                  id="sku-schedule"
                  label={SCHEDULE_LABEL}
                  helper="ردهٔ لوله (ضخامت جدار). اختیاری — اگر نمی‌دانید خالی بگذارید."
                  value={v.schedule}
                  options={suggestions?.schedules ?? []}
                  error={fieldErrors.schedule}
                  maxLength={40}
                  placeholder={SCHEDULE_PLACEHOLDER}
                  onChange={(schedule) => set({ schedule })}
                />
              ) : null}
              <PickerInput
                id="sku-factory"
                label={factoryCol}
                helper={
                  isBrand
                    ? // The whole point of the relabel: مانیسمان is imported,
                      // so the answer is where it comes from, not which
                      // Iranian mill rolled it.
                      'کشور یا برند سازنده — مثلاً «چینی» یا «اروپایی». مانیسمان وارداتی است و نام کارخانهٔ ایرانی ندارد.'
                    : 'از فهرست انتخاب کنید تا یک کارخانه دو اسم نشود.'
                }
                value={v.factory}
                options={isBrand ? BRAND_SUGGESTIONS : (suggestions?.factories ?? [])}
                error={fieldErrors.factory}
                maxLength={80}
                placeholder={isBrand ? BRAND_PLACEHOLDER : FACTORY_PLACEHOLDER}
                onChange={(factory) => set({ factory })}
              />
              {/* Rendered INDEPENDENTLY of the branch box below, not as its
                  else-branch. Until 1405/06/09 no sub-category had both a
                  grade-shaped column and a branch-length one, so a ternary was
                  harmless; میلگرد ساده («استاندارد» + «حالت»), میلگرد استیل
                  («آلیاژ» + «حالت») and لوله مسی («ضخامت» + «حالت») all do, and
                  under a ternary the first of the two would silently lose its
                  input. */}
              {writesStandardAttr || usesGradeAttr ? (
                <PickerInput
                  id={writesStandardAttr ? 'sku-standard' : 'sku-grade'}
                  label={gradeLabel}
                  helper={
                    usesAlloyAttr
                      ? 'استیل: ۲۰۱، ۳۰۴، ۳۰۴L، ۳۱۶L. در صفحهٔ کالا به مشتری نشان داده می‌شود.'
                      : usesStandardAsConditionAttr
                        ? 'حالت عرضه، مثلاً «شاخه ۴ متری». در صفحهٔ کالا به مشتری نشان داده می‌شود.'
                        : usesGradeAsStandardAttr
                          ? 'میلگرد: A1، A2، A3. در صفحهٔ کالا به مشتری نشان داده می‌شود.'
                          : usesStandardAttr
                            ? 'مثلاً HEA یا HEB (بر اساس DIN 1025). در صفحهٔ کالا به مشتری نشان داده می‌شود.'
                            : 'میلگرد: A1، A2، A3. در صفحهٔ کالا به مشتری نشان داده می‌شود.'
                  }
                  value={writesStandardAttr ? v.standard : v.grade}
                  options={
                    (writesStandardAttr ? suggestions?.standards : suggestions?.grades) ?? []
                  }
                  error={writesStandardAttr ? fieldErrors.standard : fieldErrors.grade}
                  maxLength={40}
                  placeholder={writesStandardAttr ? undefined : GRADE_PLACEHOLDER}
                  onChange={(val) =>
                    writesStandardAttr ? set({ standard: val }) : set({ grade: val })
                  }
                />
              ) : null}
              {usesBranchAttr ? (
                /* Bound to `branchLengthM` — the SAME column the «طول شاخه»
                   box in the auto-filled section normally edits, which is why
                   that box is hidden for these subs below: two inputs writing
                   one column is how they silently disagree. Stored as the
                   plain number (۶), rendered «۶ متری» by the price table, so
                   the theoretical-weight prefill keeps reading it unchanged —
                   hence the identical `touched.weight` handling. */
                <PickerInput
                  id="sku-branch"
                  label={branchAttrLabel}
                  helper={`طول شاخه به متر. در جدول قیمت زیر عنوان «${branchAttrLabel}» و به‌شکل «۶ متری» نمایش داده می‌شود؛ ${weightLabel(parentCategory?.slug)} هم بر همین طول حساب می‌شود.`}
                  value={v.branchLengthM}
                  options={['6', '12']}
                  error={
                    fieldErrors.branchLengthM ??
                    (lengthValid ? undefined : 'عدد مثبت وارد کنید یا خالی بگذارید.')
                  }
                  maxLength={10}
                  placeholder="مثلاً ۶"
                  onChange={(val) => set({ branchLengthM: val }, { weight: touched.weight })}
                />
              ) : null}
              {usesConditionAttr ? (
                <PickerInput
                  id="sku-condition"
                  label={CONDITION_LABEL}
                  helper="حالت عرضهٔ کالا، مثل برش‌خورده، رول، شیت، نرمال یا ترانس. از آلیاژ/گرید مستقل است."
                  value={legacyConditionFromGrade ? v.grade : v.condition}
                  options={suggestions?.conditions ?? []}
                  error={fieldErrors.condition}
                  maxLength={40}
                  placeholder="مثلاً رول"
                  onChange={(condition) =>
                    set(legacyConditionFromGrade ? { condition, grade: '' } : { condition })
                  }
                />
              ) : null}
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
                helper={
                  touched.name
                    ? 'دستی ویرایش شده.'
                    : `از زیر‌دسته، ${sizeCol}، مشخصات و کارخانه ساخته می‌شود.`
                }
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
                  fieldErrors.theoreticalWeightKg ??
                  (weightValid ? undefined : 'عدد مثبت وارد کنید یا خالی بگذارید.')
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
                  onChange={(e) =>
                    set({ unit: e.target.value as AdminSku['unit'] }, { unit: true })
                  }
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
              {/* Hidden exactly where the «شاخه» box above already edits this
                  column, so one field owns it. Every other category keeps this
                  box precisely as it was. */}
              {usesBranchAttr ? null : (
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
                  onChange={(e) =>
                    set({ branchLengthM: e.target.value }, { weight: touched.weight })
                  }
                />
              )}
              {/* Owner-facing feature (1405/06 request), not an edge case for
                  the rare product — kept out of «تنظیمات پیشرفته» so it is
                  visible on every open of the form, the same way every field
                  above it is.
                  Label deliberately avoids the substring «کارخانه»: Playwright's
                  `getByLabel` does substring matching by default, and this box
                  sitting a few fields below the «کارخانه» factory box made
                  `getByLabel('کارخانه')` in admin-pricing-catalog.spec.ts match
                  both — an admin never sees this ambiguity, a test locator does. */}
              <TextInput
                label="ترتیب نمایش در جدول"
                inputMode="numeric"
                placeholder="مثلاً ۱"
                helper="ترتیب این کالا درون بخش کارخانه‌اش. عدد کوچک‌تر زودتر نمایش داده می‌شود. اگر خالی بگذارید، مثل قبل بر اساس سایز مرتب می‌شود."
                value={v.order}
                error={
                  fieldErrors.order ??
                  (orderValid ? undefined : 'عدد صحیح نامنفی وارد کنید یا خالی بگذارید.')
                }
                onChange={(e) => set({ order: e.target.value })}
              />
            </div>
            <div className={s.slugPreview} style={{ marginBlockStart: 'var(--space-2)' }}>
              نشانی صفحه: /prices/{parentCategory?.slug ?? '…'}/{selectedSub?.slug ?? '…'}/
              {v.slug || '…'}
            </div>
          </div>

          <div>
            <ImageUpload
              label="تصویر کالا"
              value={v.imageUrl}
              onChange={(imageUrl) => set({ imageUrl })}
            />
          </div>

          {/* The fields a normal product never needs, so the form reads as four
              questions rather than nine. */}
          <div>
            <Button
              size="sm"
              variant="ghost"
              aria-expanded={advanced}
              onClick={() => setAdvanced((x) => !x)}
            >
              {advanced ? 'بستن تنظیمات پیشرفته' : 'تنظیمات پیشرفته'}
            </Button>
            {advanced ? (
              <div
                style={{
                  marginBlockStart: 'var(--space-3)',
                  display: 'grid',
                  gap: 'var(--space-3)',
                }}
              >
                {/* Hidden wherever `skus.standard` is already edited above —
                    under its own name (تیرآهن هاش) or under تسمه مسی's
                    «حالت» — and wherever the primary box is a relabelled
                    grade called «استاندارد» (میلگرد), so the form can never
                    show two boxes with the same label writing different
                    columns. */}
                {!writesStandardAttr && !usesGradeAsStandardAttr ? (
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
                    نشانی فعلی در گوگل ثبت شده و ممکن است مشتریان ذخیره‌اش کرده باشند. با تغییر آن،
                    انتقال خودکار از نشانی قدیمی ساخته می‌شود تا لینک‌های قبلی نشکنند.
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
                  <label
                    style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-start' }}
                  >
                    <input
                      type="checkbox"
                      checked={v.crossListedSteel}
                      onChange={(e) => set({ crossListedSteel: e.target.checked })}
                      style={{ marginBlockStart: 4 }}
                    />
                    <span>
                      این کالا از جنس استیل است — همچنین در دستهٔ «استیل» هم نمایش داده شود
                      <div className={ui.tileHint}>
                        نشانی صفحه همین یکی می‌ماند؛ فقط در فهرست «استیل» هم دیده می‌شود.
                      </div>
                    </span>
                  </label>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className={s.drawerFoot}>
          <Button
            onClick={() => save.mutate()}
            disabled={!canSave || (isEdit && !dirty)}
            loading={save.isPending}
          >
            ذخیره
          </Button>
          <Button variant="ghost" onClick={() => void requestClose()}>
            انصراف
          </Button>
          {dirty ? (
            <span className={`${ui.tileHint} ${s.footSpacer}`}>تغییرات ذخیره‌نشده</span>
          ) : null}
        </div>
      </div>
      {dialog}
    </>
  );
}

/**
 * Auto-composition for the admin product form.
 *
 * The catalog admin is not technical. Every field they can be spared is one
 * fewer chance to invent a fourth spelling of a factory, a slug in Persian, or
 * a theoretical weight that quietly breaks the customer's weight calculator.
 * So the form fills what it can derive and leaves the admin only the choices
 * that are genuinely theirs: which sub-category, which size, which factory.
 */
import { normalizeDigits } from './format';
import { slugify } from './slugify';
import { unitWeightKg, type WeightShape } from './weight';
import type { PriceBasis, PriceUnit } from '@/lib/types/domain';

/**
 * Latin slugs for the factories that actually exist in this market.
 *
 * `slugify` transliterates Persian letter-by-letter, which for a factory name
 * yields something like `zvb-ahn-asfhan` — unreadable to a Persian speaker and
 * meaningless to Google, and Persian SEO guidance is explicit that Finglish
 * URLs are the worst of both worlds. These ~40 names are the whole real set,
 * so mapping them once buys a readable URL for every product forever.
 * Anything unmapped falls back to `slugify`.
 */
const FACTORY_SLUG: Record<string, string> = {
  'ذوب‌آهن اصفهان': 'zobahan',
  'ذوب آهن اصفهان': 'zobahan',
  'فولاد کویر کاشان': 'kavir-kashan',
  'فولاد میانه': 'mianeh',
  'فولاد نیشابور': 'neyshabour',
  'ظفر بناب': 'zafar-bonab',
  'فولاد شاهرود': 'shahroud',
  'آریان فولاد': 'aryan',
  'امیرکبیر خزر': 'amirkabir-khazar',
  'سیادن ابهر': 'siadan-abhar',
  'راد همدان': 'rad-hamedan',
  فایکو: 'faico',
  'یزد احرامیان': 'yazd-ahramian',
  'فولاد اهواز': 'ahvaz',
  'ماهان سپاهان': 'mahan-sepahan',
  'جهان فولاد غرب': 'jahan-foolad-gharb',
  'جهان پروفیل پارس': 'jahan-profile-pars',
  'تهران شرق': 'tehran-shargh',
  'نیکان پروفیل': 'nikan',
  'کیان پرشیا': 'kian-persia',
  'پروفیل صابری': 'saberi',
  'پروفیل یاران': 'yaran',
  'فولاد مشهد': 'mashhad',
  'پایا اصفهان': 'paya-esfahan',
  'فولاد مبارکه': 'mobarakeh',
  'فولاد سبا': 'saba',
  'اکسین اهواز': 'oxin-ahvaz',
  'کاویان اهواز': 'kavian-ahvaz',
  'قطعات اصفهان': 'ghataat-esfahan',
  'فولاد گیلان': 'gilan',
  'هفت‌الماس': 'haft-almas',
  'ورق شهرکرد': 'shahrekord',
  تاراز: 'taraz',
  'امیرکبیر کاشان': 'amirkabir-kashan',
  'ناب تبریز': 'nab-tabriz',
  'شکفته مشهد': 'shokoufteh-mashhad',
  'سپهر ایرانیان': 'sepehr-iranian',
  'جاوید بناب': 'javid-bonab',
  'ظهوریان مشهد': 'zohourian-mashhad',
  'دهشیر یزد': 'dehshir-yazd',
  'لوله سپاهان': 'sepahan-pipe',
  سپنتا: 'sepanta',
  'نورد لوله ساوه': 'saveh-pipe',
  'درپاد تهران': 'derpad-tehran',
  کالوپ: 'kaloup',
  'لوله سمنان': 'semnan-pipe',
  'لوله‌سازی اهواز': 'ahvaz-pipe',
  'فولاد نطنز': 'natanz',
  'جهان فولاد سیرجان': 'jahan-foolad-sirjan',
  'آناهیتا گیلان': 'anahita-gilan',
};

export function factorySlug(factory: string): string {
  const key = factory.trim();
  return FACTORY_SLUG[key] ?? slugify(key);
}

/**
 * A product URL built from what the product IS, not from a transliteration of
 * its Persian name: `rebar-14-a3-zobahan`. Stable, readable, and it does not
 * change when the admin rewords the display name.
 */
export function composeSkuSlug(input: {
  categorySlug: string;
  size?: string;
  grade?: string;
  factory?: string;
}): string {
  const parts = [
    input.categorySlug,
    input.size ? normalizeDigits(input.size).replace(/×/g, 'x') : '',
    input.grade ? slugify(input.grade) : '',
    input.factory ? factorySlug(input.factory) : '',
  ];
  return parts
    .filter(Boolean)
    .join('-')
    .replace(/[^a-z0-9-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

/** The display name a customer sees, composed the way the catalog already
 *  reads: «میلگرد آجدار ۱۴ ذوب‌آهن اصفهان». Grade is deliberately excluded —
 *  it lives in its own column/field so a customer scanning the price table
 *  can read it without parsing it back out of a sentence. */
export function composeSkuName(input: { subName?: string; size?: string; factory?: string }): string {
  return [input.subName, input.size, input.factory]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(' ');
}

/**
 * What physical section a catalog sub-category actually is, and the mill
 * branch length its «وزن شاخه» is quoted for.
 *
 * This table exists because `skus.theoretical_weight_kg` used to be filled in
 * by ONE formula for the whole catalog — `d²/162 × 12`, the round-bar
 * formula — applied to whatever number a SKU's `size` string happened to
 * start with. Correct for میلگرد, and nonsense for everything else: «نبشی ۱۰»
 * was stored as 7.4 kg (a 6 m L100 is 94 kg), «قوطی ۱۰۰×۱۰۰» as 740.7 kg,
 * «ورق روغنی ۱» as 0.1 kg, «لوله ۱ اینچ» as 0.1 kg. That number renders as
 * «وزن شاخه» in the public price table and is multiplied by the quantity in
 * `leads.service`/`estimate.service` when a piece-counted order is converted
 * to kilograms, so it is a pricing input, not a label.
 *
 * Deliberately keyed on `category/sub-category`, not on category: «نبشی» and
 * «ناودانی» share the `angle-channel` category and are two different sections
 * with two different published tables, and `ibeam` holds تیرآهن (IPE), هاش
 * (HEA/HEB) and لانه‌زنبوری, which are three.
 *
 * A line is in this table only when BOTH halves of the number come from
 * something published rather than assumed — the section table AND the branch
 * length. A line that is absent gets `null`, which is the honest answer and
 * the one every consumer already handles («نامشخص» in the table, no weight
 * row on the card, `allPriced=false` rather than a silent zero). Absences are
 * therefore not gaps to be filled in later by guessing; each one is listed
 * with its reason:
 *
 * - **ناودانی سبک / سنگین** — these are genuinely separate weight classes from
 *   the استاندارد/اشتال tier that `CHANNEL_KG_PER_M` holds (see weight.ts's
 *   header), and the two public tables for them do not agree: مرکزآهن gives
 *   ناودانی سنگین ۱۴ = 18 kg/m where فولاد ایرانیان gives 16.25 — an 11 %
 *   spread on a number that would go straight onto a live commercial page.
 * - **تیرآهن سبک, لانه‌زنبوری** — each a different section from IPE, and
 *   `IBEAM_KG_PER_M` is the IPE table only. (**هاش** was in this list for the
 *   same reason until 2026-08-20, when `HEA_KG_PER_M`/`HEB_KG_PER_M` were
 *   added to `weight.ts` from DIN 1025-2/-3 and corroborated against
 *   مرکزآهن's published per-شاخه column — so the reason no longer holds and
 *   the two هاش lines are in the table below.)
 * - **نبشی بال نامساوی, سپری, نبشی لقمه** — no published table in this repo;
 *   an unequal-leg angle needs both legs and a thickness, سپری is a T
 *   section, and a لقمه is a spacer with no branch at all.
 * - **پروفیل / قوطی** — the box formula needs a WALL THICKNESS and the catalog
 *   stores none: «۴۰×۴۰» is the outside section, and the same section ships
 *   in 2 mm and 4 mm.
 * - **ورق** — the plate formula needs width × length. `skus.dimensions` exists
 *   for exactly this, and is empty on every sheet SKU today.
 * - **لوله** — the pipe formula needs a wall thickness; «۲ اینچ» is the outside
 *   diameter only.
 * - **کلاف / مفتول / توری / سیم** — sold as a coil, which is why `weight.ts`
 *   deliberately gives the `wire` shape no `DEFAULT_LENGTH_M`. There is no
 *   «شاخه» to weigh.
 */
type CatalogWeightBasis = {
  shape: WeightShape;
  /** Standard mill branch length in metres for THIS product line, sourced. */
  lengthM: number;
  /** How to read `skus.size` into the dimension the shape's formula wants. */
  sizeAs: 'diameterMm' | 'legCm' | 'sizeCode';
};

const CATALOG_WEIGHT_BASIS: Readonly<Record<string, CatalogWeightBasis>> = {
  // Round bar, d²/162 kg/m over a 12 m branch — `DEFAULT_LENGTH_M.rebar`, and
  // the basis every میلگرد row in the catalog is already priced against.
  'rebar/deformed': { shape: 'rebar', lengthM: 12, sizeAs: 'diameterMm' },
  'rebar/deformed-a2': { shape: 'rebar', lengthM: 12, sizeAs: 'diameterMm' },
  'rebar/plain': { shape: 'rebar', lengthM: 12, sizeAs: 'diameterMm' },
  'rebar/alloy': { shape: 'rebar', lengthM: 12, sizeAs: 'diameterMm' },
  // NOT `rebar/mylgrd-sadh` (میلگرد ساده), deliberately: ahanonline's own
  // میلگرد ساده listing quotes «شاخه ۶ متری» for the straight-bar mills and
  // «کلاف» (coil) for the rest, so this one sub-category mixes a 6 m branch
  // with a product that has no branch at all. There is no single length that
  // is right for it, which is exactly the condition for having no entry.
  // نبشی بال مساوی. `ANGLE_KG_PER_M` is مرکزآهن's exact published table
  // (audited into weight.ts 2026-08-09) and is keyed in MILLIMETRES of leg,
  // while the catalog's `size` is the market number in CENTIMETRES («نبشی ۱۰»
  // = L100) — hence `legCm`. 6 m is the branch length ahanonline's own نبشی
  // listing quotes almost every row in («حالت: ۶ متری»; ۱۲ متری exists but is
  // the exception), and the one مرکزآهن's table leads with. Sizes outside the
  // published table (نبشی ۱۴/۱۶/۱۸) fall through to null rather than to the
  // geometric approximation, which drifts ~5 % at those legs.
  'angle-channel/nabshi': { shape: 'angle', lengthM: 6, sizeAs: 'legCm' },
  'angle-channel/angle': { shape: 'angle', lengthM: 6, sizeAs: 'legCm' },
  // تیرآهن. `IBEAM_KG_PER_M` is keyed on the market number directly (تیرآهن ۱۴
  // = IPE140), and 12 m is both the Iranian standard branch and what the 25
  // existing branch-priced تیرآهن rows already encode — ذوب‌آهن ۱۴ is stored at
  // 155 kg, which is 12.9 × 12.
  'ibeam/tirahan': { shape: 'ibeam', lengthM: 12, sizeAs: 'sizeCode' },
  'ibeam/ipe': { shape: 'ibeam', lengthM: 12, sizeAs: 'sizeCode' },
  // هاش. Two entries, not one, because HEA and HEB are two different sections
  // at the same market size — a هاش ۲۰ is 508 kg as an HEA and 736 kg as an
  // HEB — and the sub-category is the only thing that says which. 12 m is the
  // branch length مرکزآهن's هاش listing quotes EVERY row in («طول ۱۲»), the
  // same length تیرآهن above already uses, and the one the per-شاخه weights
  // that corroborate these tables are published over.
  'ibeam/hash-sabok': { shape: 'hea', lengthM: 12, sizeAs: 'sizeCode' },
  'ibeam/hash-sangin': { shape: 'heb', lengthM: 12, sizeAs: 'sizeCode' },
};

/** The composition key for a sub-category, as `CATALOG_WEIGHT_BASIS` is keyed. */
export function weightBasisKey(categorySlug: string, subSlug?: string): string {
  return `${categorySlug}/${subSlug ?? ''}`;
}

/**
 * Theoretical weight of one branch, in kg — or `null` when this product line
 * has no derivable one. See `CATALOG_WEIGHT_BASIS` above for the per-line
 * reasoning; the arithmetic itself is always `unitWeightKg`, the same table
 * the وزن‌سنج, the `/api/tools/weight` endpoint and the AI advisor use, so an
 * admin-facing default can never disagree with the customer-facing calculator.
 *
 * `subSlug` is required to get a non-null answer for anything but the
 * historical rebar/wire behaviour: the section is a property of the
 * sub-category, not of the category.
 */
export function theoreticalWeightFor(
  categorySlug: string,
  size?: string,
  subSlug?: string,
  branchLengthM?: number | null,
): number | null {
  if (!size) return null;
  const basis = CATALOG_WEIGHT_BASIS[weightBasisKey(categorySlug, subSlug)];
  if (!basis) return null;
  const n = Number(normalizeDigits(size).replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  const dims =
    basis.sizeAs === 'diameterMm'
      ? { diameterMm: n }
      : basis.sizeAs === 'legCm'
        ? // ANGLE_KG_PER_M is keyed in mm of leg; the catalog size is in cm.
          { sizeCode: n * 10 }
        : { sizeCode: n };
  // The SKU's OWN branch length wins over the line's convention when one is
  // recorded. نبشی is the case that forced this: مرکزآهن and ahanonline both
  // sell it in 6 m AND 12 m, and ahanonline's «حالت» column says which per
  // row — so a per-line constant is right for the rows that do not say and
  // exactly 2× wrong for the rows that say ۱۲ متری. A non-positive or
  // non-finite override is ignored rather than trusted.
  const lengthM =
    branchLengthM != null && Number.isFinite(branchLengthM) && branchLengthM > 0
      ? branchLengthM
      : basis.lengthM;
  const branch = unitWeightKg(basis.shape, { ...dims, lengthM });
  if (branch === null) return null;
  return Math.round(branch * 10) / 10 || null;
}

/**
 * The branch length this product line is assumed to be sold in when the SKU
 * itself records none — i.e. the documented catalog convention, exposed so the
 * admin form can prefill «طول شاخه» instead of leaving the operator to guess
 * and so a script can state what it defaulted to. `null` where the line has no
 * meaningful branch at all (a coil, a sheet, a کوپلر).
 */
export function defaultBranchLengthM(categorySlug: string, subSlug?: string): number | null {
  return CATALOG_WEIGHT_BASIS[weightBasisKey(categorySlug, subSlug)]?.lengthM ?? null;
}

/**
 * Sub-categories sold per PIECE, whatever their category's default is.
 * کوپلر lives under میلگرد, which defaults to «شاخه» — and «۲۰ شاخه کوپلر» is
 * both wrong and, because a `branch` price is per kilogram in this codebase,
 * a pricing error rather than just a wording one.
 */
const PIECE_SUBS = new Set(['coupler']);

/** Sub-categories sold by the square metre. ساندویچ‌پانل is quoted, ordered
 *  and delivered in «متر مربع» on every source that publishes it. */
const SQM_SUBS = new Set(['sandwich-panel']);

/**
 * What a NEW SKU in this line should default its `price_basis` to — i.e. what
 * a price typed into the admin form will be per unless the operator says
 * otherwise.
 *
 * Only the lines where the whole market quotes something other than a
 * kilogram are listed. Everything else stays `kg`, which is what the catalog
 * has always meant and what all ~880 other rows are. This is a PREFILL, not a
 * rule: the column is per-SKU and the form can override it, because وال پست
 * and لوله مسی are per-item inside sub-categories that are not.
 */
export function defaultPriceBasisFor(categorySlug: string, subSlug?: string): PriceBasis {
  if (subSlug && PIECE_SUBS.has(subSlug)) return 'piece';
  if (subSlug && SQM_SUBS.has(subSlug)) return 'sqm';
  return 'kg';
}

/** How this product is actually sold, so the admin does not have to know. */
export function defaultUnitFor(categorySlug: string, subSlug?: string): PriceUnit {
  if (subSlug && PIECE_SUBS.has(subSlug)) return 'piece';
  if (subSlug && SQM_SUBS.has(subSlug)) return 'sqm';
  switch (categorySlug) {
    case 'rebar':
    case 'ibeam':
    case 'angle-channel':
      return 'branch';
    case 'sheet':
      return 'sheet';
    case 'pipe':
    case 'profile':
      return 'meter';
    default:
      return 'kg';
  }
}

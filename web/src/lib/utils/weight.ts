/**
 * The ONE theoretical-weight formula table for the whole app.
 *
 * Until this module existed the same physics was written out four times:
 * `POST /api/tools/weight` (the وزن‌سنج endpoint), the AI advisor's
 * `calcWeight` tool in `server/services/aiTools.ts`, the client-side
 * `WeightCalculator` component, and `catalogCompose.theoreticalWeightFor`.
 * They had already diverged: the advisor knew eight shapes, the endpoint
 * knew four, and «نبشی/تسمه» in the UI computed a flat-bar section while the
 * advisor's `angle` computed an equal-leg angle — two different numbers for
 * what a customer reads as the same button.
 *
 * That matters more here than in most apps: weight × unit price IS the
 * پیش‌فاکتور total the customer is quoted and a human then closes on. Two
 * code paths disagreeing about a branch's weight is a pricing bug, not a
 * cosmetic one.
 *
 * Deliberately dependency-free and framework-free so the browser bundle, the
 * route handler and the AI tool runner can all import the identical numbers.
 *
 * INVARIANT: every formula below is byte-for-byte the arithmetic that was
 * already shipping, so no number that has ever been quoted changes. New
 * shapes are additive only. `weight.test.ts` pins each one.
 *
 * audit-2026-08-09: Amir asked for a rigorous page-by-page comparison against
 * مرکزآهن's published جدول‌وزن pages (a well-known Iranian bazaar reference)
 * for every shape this site's وزن‌سنج exposes. Findings, applied below:
 *  - میلگرد/ورق: their published formula is byte-identical to ours — no change.
 *  - `IBEAM_KG_PER_M`/`CHANNEL_KG_PER_M` were consistently ~2% above their
 *    "استاندارد/اشتال" (DIN/Stahl-standard) reference table — updated to match
 *    their exact published numbers (also added تیرآهن ۸/۱۰, missing before).
 *    Note ناودانی is genuinely sold in multiple weight classes in the real
 *    Iranian market (فوق‌سبک/سبک/نیمه‌سنگین/سنگین/کارخانه‌ای) — this table is
 *    deliberately the «استاندارد» tier (مرکزآهن's own words: "در حالت
 *    استاندارد، اعداد جدول اشتال ملاک اصلی محاسبه و مقایسه محسوب می‌شوند"),
 *    matching what this table already represented before this pass.
 *  - `angle` (نبشی)'s geometric approximation (ignores the corner fillet
 *    radius) was accurate to ~1.3% for small legs but drifted to a consistent
 *    ~5.1% under their published table for legs ≥60mm — bigger than this
 *    file used to claim ("~1-2%"). Added `ANGLE_KG_PER_M`, an exact lookup
 *    for their published standard sizes; `sizeCode` now picks that path,
 *    while arbitrary leg/thickness combos (a caller with a non-catalog
 *    dimension) still fall back to the original geometric formula, UNCHANGED.
 *  - لوله's formula is π×(D−t)×t×ρ — dimensionally EXACT for a pipe wall's
 *    cross-sectional area, not an approximation — left as-is. Their published
 *    table increasingly diverges at thicker walls (1.8% → 6.6%), which reads
 *    as real mill/schedule manufacturing variance a closed-form formula can't
 *    capture, not an error in either number.
 */

/** Steel density, g/cm³. */
export const STEEL_DENSITY = 7.85;

/** Wall-weight constant for round tube: π × ρ / 1000 ≈ 0.02466 kg/(mm²·m). */
const PIPE_CONSTANT = 0.02466;

export type WeightShape =
  | 'rebar'
  | 'wire'
  | 'plate'
  | 'pipe'
  | 'box'
  | 'angle'
  | 'flat'
  | 'ibeam'
  | 'channel'
  | 'hea'
  | 'heb';

/**
 * Standard EN 10025-1/2 weight-per-meter (kg/m), keyed by the market size
 * number used in Iran (تیرآهن ۱۴ = IPE140, ناودانی ۱۰ = UNP100 — the number
 * IS the profile height in cm, matching `lib/data/nav.ts` catalog sizes).
 * Sourced from published mill tables, not a geometric approximation (I-beam
 * and channel flanges taper — no reliable closed-form exists) — a size
 * missing here (e.g. ناودانی ۳–۶, below UNP80) returns null rather than a
 * guessed number. Cross-checked 2026-08-09 against مرکزآهن's published
 * جدول‌وزن (استاندارد/اشتال tier for ناودانی) — see the file header.
 */
export const IBEAM_KG_PER_M: Readonly<Record<string, number>> = {
  '8': 6.0, '10': 8.1, '12': 10.4, '14': 12.9, '16': 15.8, '18': 18.8,
  '20': 22.4, '22': 26.2, '24': 30.7, '27': 36.1, '30': 42.2,
};
export const CHANNEL_KG_PER_M: Readonly<Record<string, number>> = {
  '8': 8.82, '10': 10.6, '12': 13.4, '14': 16.0, '16': 18.8,
  '18': 22.4, '20': 25.3, '22': 29.4, '24': 33.8,
};

/**
 * Wide-flange هاش weight-per-meter (kg/m) — HEA (DIN 1025-3) and HEB
 * (DIN 1025-2) — keyed, like `IBEAM_KG_PER_M`, on the market size number used
 * in Iran («هاش ۱۴» = HE140A/HE140B, i.e. the profile height in cm).
 *
 * These are SEPARATE tables from `IBEAM_KG_PER_M` on purpose: a هاش is a
 * wide-flange section, not an IPE, and until this existed
 * `CATALOG_WEIGHT_BASIS` deliberately gave every هاش row `null` for exactly
 * that reason («IBEAM_KG_PER_M is the IPE table only»). A HE140B is 33.7 kg/m
 * where an IPE140 is 12.9 — reusing the IPE table would have been a 2.6×
 * error on a پیش‌فاکتور, so the sections get their own numbers or none.
 *
 * Sourced 2026-08-20 from the DIN 1025-2/-3 nominal section tables and
 * corroborated row-by-row against مرکزآهن's live هاش listing, which publishes
 * a «وزن هر شاخه» over a 12 m branch for every size:
 *
 *   HEA  14→297  16→365  18→426  20→508   (kg per 12 m; table × 12 = 296.4 /
 *   HEB  16→512  18→615  20→736  22→858    364.8 / 426.0 / 507.6 / 511.2 /
 *        24→999                            614.4 / 735.6 / 858.0 / 998.4)
 *
 * — nine sizes agreeing to within 0.2 %. The one size where they do NOT agree
 * is recorded rather than smoothed over: مرکزآهن publishes HEA 24 = 702 kg,
 * where DIN 1025-3's 60.3 kg/m over 12 m is 723.6 — a 3.0 % gap. The DIN
 * figure is what this table holds (it is the standard section), and no weight
 * was written to that SKU in the database, because a 3 % disagreement on a
 * number that multiplies into a quote is not a rounding difference.
 *
 * Only the sizes this catalog actually lists are tabulated. A size absent here
 * returns null rather than an interpolated guess, exactly as ibeam/channel do.
 */
export const HEA_KG_PER_M: Readonly<Record<string, number>> = {
  '10': 16.7, '12': 19.9, '14': 24.7, '16': 30.4, '18': 35.5,
  '20': 42.3, '22': 50.5, '24': 60.3, '26': 68.2, '28': 76.4,
};
export const HEB_KG_PER_M: Readonly<Record<string, number>> = {
  '10': 20.4, '12': 26.7, '14': 33.7, '16': 42.6, '18': 51.2,
  '20': 61.3, '22': 71.5, '24': 83.2, '26': 93.0, '28': 103.0,
};

/**
 * Standard equal-leg نبشی (angle) weight-per-meter (kg/m), keyed by leg
 * length (mm) — each published leg size ships at one standard thickness
 * (30mm→3mm, 40mm→4mm, ... 120mm→12mm), so unlike ibeam/channel there is no
 * separate thickness axis here. Exact published values (مرکزآهن جدول وزن
 * نبشی, 2026-08-09) — used instead of the geometric `angle` formula below
 * when a caller has a catalog size (`sizeCode`), since the geometric
 * approximation (which ignores the corner fillet radius) drifts to ~5% under
 * these for legs ≥60mm. The geometric formula stays available for any
 * leg/thickness combo NOT in this table.
 */
export const ANGLE_KG_PER_M: Readonly<Record<string, number>> = {
  '30': 1.36, '40': 2.42, '50': 3.77, '60': 5.66, '70': 7.70,
  '80': 10.06, '100': 15.72, '120': 22.63,
};

/**
 * Standard mill branch length, in metres, for the shapes that have one.
 * Shapes absent here have NO default on purpose: wire is sold by coil, and
 * a plate/angle/beam length is never safe to assume — the caller (or the
 * model) must supply it rather than have a number invented for the quote.
 */
export const DEFAULT_LENGTH_M: Readonly<Partial<Record<WeightShape, number>>> = {
  rebar: 12,
  pipe: 6,
  box: 6,
};

/**
 * Every dimension any shape can take. All optional: a caller that has not
 * collected enough of them gets `null` back, never a partial guess.
 */
export interface WeightDims {
  /** Nominal round-bar diameter (mm) — rebar, wire. */
  diameterMm?: number;
  /** Wall / plate / leg thickness (mm) — plate, pipe, box, angle, flat. */
  thicknessMm?: number;
  /** Plate width, in METRES (the plate formula's only metre-denominated width). */
  widthM?: number;
  /** Length of one piece, in metres. */
  lengthM?: number;
  /** Box-section width (mm). Also the flat-bar width. */
  widthMm?: number;
  /** Box-section height (mm). */
  heightMm?: number;
  /** Pipe outside diameter (mm). */
  outerDiameterMm?: number;
  /** Equal-leg angle leg length (mm). */
  legMm?: number;
  /** Market size number for ibeam/channel (تیرآهن ۱۸ → 18). */
  sizeCode?: number;
}

/**
 * Weight of ONE piece, in kg — or `null` when the dimensions this shape
 * needs are missing (or physically impossible). Never throws, never guesses.
 *
 * The returned value is unrounded; rounding is a presentation decision and
 * belongs to the caller, so the API's 2-dp rounding and the UI's display
 * rounding stay exactly where they were.
 */
export function unitWeightKg(shape: WeightShape, d: WeightDims): number | null {
  const len = d.lengthM ?? DEFAULT_LENGTH_M[shape];
  switch (shape) {
    // d²/162 kg per metre — the industry formula for round bar.
    case 'rebar':
      return d.diameterMm && len ? ((d.diameterMm * d.diameterMm) / 162) * len : null;
    // Round rod: identical physics to rebar, but NO default length (wire is
    // sold by coil, not a standard branch), so the caller must supply one.
    case 'wire':
      return d.diameterMm && d.lengthM ? ((d.diameterMm * d.diameterMm) / 162) * d.lengthM : null;
    // t(mm) × w(m) × l(m) × 7.85 kg — the mm/m mix is deliberate and cancels.
    case 'plate':
      return d.thicknessMm && d.widthM && d.lengthM
        ? d.thicknessMm * d.widthM * d.lengthM * STEEL_DENSITY
        : null;
    // (D − t) × t × 0.02466 kg per metre.
    case 'pipe':
      // t >= D is not a thin pipe, it is a geometric impossibility, and the
      // old endpoint answered it with a NEGATIVE weight that would have gone
      // straight onto a پیش‌فاکتور. The UI calculator already rejected it;
      // now every caller does.
      return d.outerDiameterMm && d.thicknessMm && len && d.thicknessMm < d.outerDiameterMm
        ? (d.outerDiameterMm - d.thicknessMm) * d.thicknessMm * PIPE_CONSTANT * len
        : null;
    // perimeter(m) × t(mm) × 7.85 kg per metre.
    case 'box':
      return d.widthMm && d.heightMm && d.thicknessMm && len
        ? (((d.widthMm + d.heightMm) * 2) / 1000) * d.thicknessMm * STEEL_DENSITY * len
        : null;
    // Equal-leg angle. A catalog leg size (`sizeCode`) uses the exact
    // published table; otherwise falls back to Area(mm²) = t·(2a−t), the
    // standard steel-industry approximation (ignores the small fillet
    // radius — accurate to ~1-2% for small legs, but drifts further for
    // larger ones, which is exactly why the table above exists).
    case 'angle': {
      if (d.sizeCode) {
        const kgPerM = ANGLE_KG_PER_M[String(Math.round(d.sizeCode))];
        return kgPerM && len ? kgPerM * len : null;
      }
      return d.legMm && d.thicknessMm && d.lengthM
        ? d.thicknessMm * (2 * d.legMm - d.thicknessMm) * (STEEL_DENSITY / 1000) * d.lengthM
        : null;
    }
    // Flat bar (تسمه): w(mm) × t(mm) × 0.00785 kg per metre. A DIFFERENT
    // section from `angle` — kept separate rather than merged, because the
    // وزن‌سنج UI has always quoted this formula under its «نبشی/تسمه» tab and
    // merging them would silently change a number customers already act on.
    case 'flat':
      return d.widthMm && d.thicknessMm && d.lengthM
        ? d.widthMm * d.thicknessMm * (STEEL_DENSITY / 1000) * d.lengthM
        : null;
    case 'ibeam': {
      const kgPerM = d.sizeCode ? IBEAM_KG_PER_M[String(Math.round(d.sizeCode))] : undefined;
      return kgPerM && d.lengthM ? kgPerM * d.lengthM : null;
    }
    case 'channel': {
      const kgPerM = d.sizeCode ? CHANNEL_KG_PER_M[String(Math.round(d.sizeCode))] : undefined;
      return kgPerM && d.lengthM ? kgPerM * d.lengthM : null;
    }
    // هاش. Same shape of lookup as ibeam/channel and, like them, no
    // DEFAULT_LENGTH_M — a beam length is never safe to assume, so the caller
    // supplies it (the catalog's own 12 m convention lives in
    // `CATALOG_WEIGHT_BASIS`, where it is sourced).
    case 'hea': {
      const kgPerM = d.sizeCode ? HEA_KG_PER_M[String(Math.round(d.sizeCode))] : undefined;
      return kgPerM && d.lengthM ? kgPerM * d.lengthM : null;
    }
    case 'heb': {
      const kgPerM = d.sizeCode ? HEB_KG_PER_M[String(Math.round(d.sizeCode))] : undefined;
      return kgPerM && d.lengthM ? kgPerM * d.lengthM : null;
    }
    default:
      return null;
  }
}

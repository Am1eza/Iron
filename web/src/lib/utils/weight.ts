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
  | 'channel';

/**
 * Standard EN 10025-1/2 weight-per-meter (kg/m), keyed by the market size
 * number used in Iran (تیرآهن ۱۴ = IPE140, ناودانی ۱۰ = UNP100 — the number
 * IS the profile height in cm, matching `lib/data/nav.ts` catalog sizes).
 * Sourced from published mill tables, not a geometric approximation (I-beam
 * and channel flanges taper — no reliable closed-form exists) — a size
 * missing here (e.g. ناودانی ۳–۶, below UNP80) returns null rather than a
 * guessed number.
 */
export const IBEAM_KG_PER_M: Readonly<Record<string, number>> = {
  '12': 10.6, '14': 13.1, '16': 16.1, '18': 19.2, '20': 22.8,
  '22': 26.7, '24': 31.3, '27': 36.8, '30': 43.0,
};
export const CHANNEL_KG_PER_M: Readonly<Record<string, number>> = {
  '8': 8.82, '10': 10.8, '12': 13.6, '14': 16.3, '16': 19.2,
  '18': 22.4, '20': 25.7, '22': 30.0, '24': 33.8,
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
    // Equal-leg angle: Area(mm²) = t·(2a−t) — the standard steel-industry
    // approximation (ignores the small fillet radius, ~1-2% under actual).
    case 'angle':
      return d.legMm && d.thicknessMm && d.lengthM
        ? d.thicknessMm * (2 * d.legMm - d.thicknessMm) * (STEEL_DENSITY / 1000) * d.lengthM
        : null;
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
    default:
      return null;
  }
}

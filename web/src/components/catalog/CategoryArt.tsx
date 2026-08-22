/**
 * Category artwork — compact outline icons (currentColor body + a small
 * brand-teal accent) so they read clean at the 22px rail size and stay
 * legible larger in the desktop flyout fallback. Decorative (aria-hidden).
 *
 * ## One stroke weight, and it is `PRIMARY`
 *
 * The header claimed «uniform stroke weight» and the drawings did not have
 * one: at the same `viewBox="0 0 64 64"` the primary outline ranged from 4
 * (felezat-rangi) to 9 (etesalat-felezi) — better than 2×. That matters
 * because these are seen SIDE BY SIDE at one size: `/search` draws every
 * category as an icon chip in a single row, `CategoryStage` lists them down
 * the mobile rail, and the mega-menu rail + panel draw them for whichever
 * categories have no product photo. Different weights at the same size read
 * as different levels of emphasis, so «نبشی و ناودانی» (7) sat forward of
 * «فلزات رنگی» (4) for no reason anyone chose.
 *
 * So every icon's primary outline is `PRIMARY` and every secondary or accent
 * stroke is `ACCENT`, one step lighter — the same two-tier discipline
 * `SubCategoryArt` already keeps with its single 1.6 at a 24 viewBox (the
 * same optical weight one size class down). Two shapes needed a geometry
 * nudge rather than just a number to carry the heavier line: فلزات رنگی's
 * ingots grew from 9 to 12 units tall (a 5-wide stroke on a 9-tall pill
 * closes the pill up into a solid bar) and ورق's lower two plates moved a
 * unit further apart. Both were checked rendered at 22, 28, 40 and 64px.
 *
 * This is a consistency pass over the drawings that exist, deliberately not a
 * redesign of the icon system — that is being explored separately.
 */

/** The outline weight of every icon here, at this file's 64-unit viewBox. */
const PRIMARY = 5;
/** Secondary and accent detail — one step lighter, never the shape's outline. */
const ACCENT = 3.5;
type Props = { slug: string; size?: number };

export function CategoryArt({ slug, size = 64 }: Props) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 64 64',
    fill: 'none',
    'aria-hidden': true,
    focusable: false,
  } as const;
  const A = '#0A7F77'; // brand teal accent

  switch (slug) {
    case 'rebar': // ribbed bar — outline segment with horizontal rib ticks
      return (
        <svg {...common}>
          <rect x="24" y="8" width="16" height="48" rx="8" stroke="currentColor" strokeWidth={PRIMARY} />
          <g stroke={A} strokeWidth={ACCENT} strokeLinecap="round">
            <path d="M18 18h28M18 28h28M18 38h28M18 48h28" />
          </g>
        </svg>
      );
    case 'ibeam': // I-beam cross-section
      return (
        <svg {...common}>
          <path d="M14 12h36M14 52h36M32 12v40" stroke="currentColor" strokeWidth={PRIMARY} strokeLinecap="round" />
        </svg>
      );
    case 'profile': // hollow square tube — concentric outline squares
      return (
        <svg {...common}>
          <rect x="12" y="12" width="40" height="40" rx="6" stroke="currentColor" strokeWidth={PRIMARY} />
          <rect x="24" y="24" width="16" height="16" rx="3" stroke="currentColor" strokeWidth={ACCENT} opacity="0.55" />
        </svg>
      );
    // Three real category slugs (hot/cold/steel sheet) share this artwork —
    // same rationale as rebar's sub-grades sharing one icon: the SHAPE is the
    // same product family, sub-type is conveyed by the row's own label text.
    // 'sheet' itself isn't a real category slug in this codebase (kept as an
    // alias so any future/mock caller using the generic name still resolves).
    case 'varagh-garm':
    case 'varagh-sard':
    case 'varagh-steel':
    case 'sheet': // stacked plates
      return (
        <svg {...common}>
          <path d="M8 24l24-9 24 9-24 9z" stroke="currentColor" strokeWidth={PRIMARY} strokeLinejoin="round" />
          <path d="M8 34l24 9 24-9" stroke="currentColor" strokeWidth={ACCENT} opacity="0.7" strokeLinejoin="round" strokeLinecap="round" />
          <path d="M8 43l24 9 24-9" stroke={A} strokeWidth={ACCENT} opacity="0.95" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      );
    case 'angle-channel': // L angle bracket
      return (
        <svg {...common}>
          <path d="M16 10v36h32" stroke="currentColor" strokeWidth={PRIMARY} strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="43" cy="17" r="3.5" fill={A} stroke="none" />
        </svg>
      );
    case 'pipe': // tube ring
      return (
        <svg {...common}>
          <circle cx="32" cy="32" r="20" stroke="currentColor" strokeWidth={PRIMARY} />
          <circle cx="32" cy="32" r="9" stroke="currentColor" strokeWidth={ACCENT} opacity="0.55" />
        </svg>
      );
    case 'wire': // coil
      return (
        <svg {...common}>
          <g stroke="currentColor" strokeWidth={PRIMARY} strokeLinecap="round">
            <path d="M16 18c14-7 30 0 30 9s-16 9-30 2" />
            <path d="M16 32c14-7 30 0 30 9s-16 9-30 2" opacity="0.6" />
          </g>
        </svg>
      );
    case 'steel': // billet — hexagonal bar stock cross-section
      return (
        <svg {...common}>
          <path d="M32 8l20 12v24L32 56 12 44V20z" stroke="currentColor" strokeWidth={PRIMARY} strokeLinejoin="round" />
          <path d="M32 8v24M32 32l20-12M32 32L12 20" stroke={A} strokeWidth={ACCENT} strokeLinecap="round" opacity="0.7" />
        </svg>
      );
    case 'shiralat-sanati': // gate valve — bowtie (P&ID convention) + handwheel
      return (
        <svg {...common}>
          <path d="M8 18l22 14-22 14zM56 18L34 32l22 14z" fill="currentColor" stroke="none" />
          <circle cx="32" cy="10" r="5" stroke={A} strokeWidth={ACCENT} />
          <path d="M32 15v6" stroke={A} strokeWidth={ACCENT} strokeLinecap="round" />
        </svg>
      );
    case 'etesalat-felezi': // pipe elbow fitting
      return (
        <svg {...common}>
          <path d="M16 52V28a12 12 0 0112-12h24" stroke="currentColor" strokeWidth={PRIMARY} strokeLinecap="round" />
          <circle cx="28" cy="28" r="3.5" fill={A} stroke="none" />
        </svg>
      );
    case 'flanj-va-etesalat': // flange ring — bolt holes at N/E/S/W
      return (
        <svg {...common}>
          <circle cx="32" cy="32" r="17" stroke="currentColor" strokeWidth={PRIMARY} />
          <circle cx="32" cy="9" r="4" fill={A} stroke="none" />
          <circle cx="32" cy="55" r="4" fill={A} stroke="none" />
          <circle cx="9" cy="32" r="4" fill={A} stroke="none" />
          <circle cx="55" cy="32" r="4" fill={A} stroke="none" />
        </svg>
      );
    case 'felezat-rangi': // non-ferrous metals — stacked ingots
      return (
        <svg {...common}>
          {/* 12 units tall, not the original 9: a PRIMARY-weight stroke on a
              9-tall pill leaves ~4 units of interior and the ingot closes up
              into a solid bar at 22px. Taller keeps them reading as three
              stacked, open sections. */}
          <rect x="10" y="36" width="26" height="12" rx="6" stroke="currentColor" strokeWidth={PRIMARY} transform="rotate(-8 23 42)" />
          <rect x="16" y="23" width="26" height="12" rx="6" stroke="currentColor" strokeWidth={PRIMARY} opacity="0.75" transform="rotate(-8 29 29)" />
          <rect x="22" y="10" width="26" height="12" rx="6" stroke="currentColor" strokeWidth={PRIMARY} opacity="0.5" transform="rotate(-8 35 16)" />
          <circle cx="52" cy="12" r="3.4" fill={A} stroke="none" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="32" cy="32" r="20" stroke="currentColor" strokeWidth={PRIMARY} />
        </svg>
      );
  }
}

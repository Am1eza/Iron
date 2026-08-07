/**
 * Category artwork — compact outline icons (uniform stroke weight,
 * currentColor body + a small brand-teal accent) so they read clean at the
 * 22px mobile rail size and stay legible larger in the desktop flyout
 * fallback. Decorative (aria-hidden).
 */
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
          <rect x="24" y="8" width="16" height="48" rx="8" stroke="currentColor" strokeWidth="5" />
          <g stroke={A} strokeWidth="4" strokeLinecap="round">
            <path d="M18 18h28M18 28h28M18 38h28M18 48h28" />
          </g>
        </svg>
      );
    case 'ibeam': // I-beam cross-section
      return (
        <svg {...common}>
          <path d="M14 12h36M14 52h36M32 12v40" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
        </svg>
      );
    case 'profile': // hollow square tube — concentric outline squares
      return (
        <svg {...common}>
          <rect x="12" y="12" width="40" height="40" rx="6" stroke="currentColor" strokeWidth="5" />
          <rect x="24" y="24" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="4" opacity="0.55" />
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
          <path d="M8 24l24-9 24 9-24 9z" stroke="currentColor" strokeWidth="4.5" strokeLinejoin="round" />
          <path d="M8 33l24 9 24-9" stroke="currentColor" strokeWidth="4.5" opacity="0.7" strokeLinejoin="round" strokeLinecap="round" />
          <path d="M8 41l24 9 24-9" stroke={A} strokeWidth="4" opacity="0.95" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      );
    case 'angle-channel': // L angle bracket
      return (
        <svg {...common}>
          <path d="M16 10v36h32" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="42" cy="16" r="3" fill={A} stroke="none" />
        </svg>
      );
    case 'pipe': // tube ring
      return (
        <svg {...common}>
          <circle cx="32" cy="32" r="20" stroke="currentColor" strokeWidth="6" />
          <circle cx="32" cy="32" r="9" stroke="currentColor" strokeWidth="4" opacity="0.55" />
        </svg>
      );
    case 'wire': // coil
      return (
        <svg {...common}>
          <g stroke="currentColor" strokeWidth="5" strokeLinecap="round">
            <path d="M16 18c14-7 30 0 30 9s-16 9-30 2" />
            <path d="M16 32c14-7 30 0 30 9s-16 9-30 2" opacity="0.6" />
          </g>
        </svg>
      );
    case 'steel': // billet — hexagonal bar stock cross-section
      return (
        <svg {...common}>
          <path d="M32 8l20 12v24L32 56 12 44V20z" stroke="currentColor" strokeWidth="5" strokeLinejoin="round" />
          <path d="M32 8v24M32 32l20-12M32 32L12 20" stroke={A} strokeWidth="3" strokeLinecap="round" opacity="0.7" />
        </svg>
      );
    case 'shiralat-sanati': // gate valve — bowtie (P&ID convention) + handwheel
      return (
        <svg {...common}>
          <path d="M8 18l22 14-22 14zM56 18L34 32l22 14z" fill="currentColor" stroke="none" />
          <circle cx="32" cy="10" r="5" stroke={A} strokeWidth="4" />
          <path d="M32 15v6" stroke={A} strokeWidth="4" strokeLinecap="round" />
        </svg>
      );
    case 'etesalat-felezi': // pipe elbow fitting
      return (
        <svg {...common}>
          <path d="M16 52V28a12 12 0 0112-12h24" stroke="currentColor" strokeWidth="9" strokeLinecap="round" />
          <circle cx="28" cy="28" r="3" fill={A} stroke="none" />
        </svg>
      );
    case 'flanj-va-etesalat': // flange ring — bolt holes at N/E/S/W
      return (
        <svg {...common}>
          <circle cx="32" cy="32" r="17" stroke="currentColor" strokeWidth="6" />
          <circle cx="32" cy="9" r="4.5" fill={A} stroke="none" />
          <circle cx="32" cy="55" r="4.5" fill={A} stroke="none" />
          <circle cx="9" cy="32" r="4.5" fill={A} stroke="none" />
          <circle cx="55" cy="32" r="4.5" fill={A} stroke="none" />
        </svg>
      );
    case 'felezat-rangi': // non-ferrous metals — stacked ingots
      return (
        <svg {...common}>
          <rect x="10" y="38" width="28" height="9" rx="4.5" stroke="currentColor" strokeWidth="4" transform="rotate(-8 24 42)" />
          <rect x="16" y="26" width="28" height="9" rx="4.5" stroke="currentColor" strokeWidth="4" opacity="0.75" transform="rotate(-8 30 30)" />
          <rect x="22" y="14" width="28" height="9" rx="4.5" stroke="currentColor" strokeWidth="4" opacity="0.5" transform="rotate(-8 36 18)" />
          <circle cx="49" cy="15" r="3.4" fill={A} stroke="none" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="32" cy="32" r="20" stroke="currentColor" strokeWidth="5" />
        </svg>
      );
  }
}

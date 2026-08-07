/**
 * Category artwork — bold, recognizable steel-section illustrations shown when the
 * rail item is hovered (the «text → image» swap). currentColor for the body + an
 * amber accent line, so they sit on any surface. Decorative (aria-hidden).
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
    case 'rebar': // ribbed bars (bundle)
      return (
        <svg {...common}>
          <rect x="14" y="10" width="9" height="44" rx="4.5" fill="currentColor" />
          <rect x="28" y="10" width="9" height="44" rx="4.5" fill="currentColor" opacity="0.85" />
          <rect x="42" y="10" width="9" height="44" rx="4.5" fill="currentColor" opacity="0.7" />
          <g stroke={A} strokeWidth="2.4" strokeLinecap="round">
            <path d="M13 18l11-4M13 30l11-4M13 42l11-4" />
          </g>
        </svg>
      );
    case 'ibeam': // I-beam cross-section
      return (
        <svg {...common}>
          <path
            d="M12 12h40v8H37v24h15v8H12v-8h15V20H12z"
            fill="currentColor"
          />
          <rect x="29" y="20" width="6" height="24" fill={A} opacity="0.9" />
        </svg>
      );
    case 'profile': // square hollow tube
      return (
        <svg {...common}>
          <rect x="12" y="12" width="40" height="40" rx="5" fill="currentColor" />
          <rect x="22" y="22" width="20" height="20" rx="3" fill="#0a0d11" />
          <path d="M12 17h40" stroke={A} strokeWidth="3" strokeLinecap="round" />
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
          <path d="M8 24l24-9 24 9-24 9z" fill="currentColor" />
          <path d="M8 33l24 9 24-9" stroke="currentColor" strokeWidth="4" opacity="0.7" fill="none" strokeLinejoin="round" />
          <path d="M8 41l24 9 24-9" stroke={A} strokeWidth="3.4" opacity="0.95" fill="none" strokeLinejoin="round" />
        </svg>
      );
    case 'angle-channel': // L angle + U channel
      return (
        <svg {...common}>
          <path d="M14 10h8v34h18v8H14z" fill="currentColor" />
          <path d="M40 10h10v8h-2v22h2v8H40z" fill={A} opacity="0.9" />
        </svg>
      );
    case 'pipe': // tube ring
      return (
        <svg {...common}>
          <circle cx="32" cy="32" r="22" fill="currentColor" />
          <circle cx="32" cy="32" r="11" fill="#0a0d11" />
          <path d="M32 10a22 22 0 0119 11" stroke={A} strokeWidth="3.2" strokeLinecap="round" fill="none" />
        </svg>
      );
    case 'wire': // coil / spiral
      return (
        <svg {...common}>
          <g stroke="currentColor" strokeWidth="5" strokeLinecap="round" fill="none">
            <path d="M18 16c14-6 28 0 28 8s-14 10-28 6" />
            <path d="M18 30c14-6 28 0 28 8s-14 10-28 6" opacity="0.8" />
          </g>
          <circle cx="46" cy="24" r="3" fill={A} />
        </svg>
      );
    case 'steel': // billet — hexagonal bar stock cross-section
      return (
        <svg {...common}>
          <path d="M32 8l20 12v24L32 56 12 44V20z" fill="currentColor" />
          <path
            d="M32 8v24M32 32l20-12M32 32L12 20"
            stroke={A}
            strokeWidth="2.4"
            strokeLinecap="round"
            opacity="0.9"
          />
        </svg>
      );
    case 'shiralat-sanati': // gate valve — pipe stubs + body + handwheel
      return (
        <svg {...common}>
          <rect x="6" y="28" width="16" height="8" rx="2" fill="currentColor" />
          <rect x="42" y="28" width="16" height="8" rx="2" fill="currentColor" />
          <rect x="24" y="24" width="16" height="16" rx="3" fill="currentColor" />
          <rect x="29" y="20" width="6" height="6" fill={A} />
          <circle cx="32" cy="14" r="9" fill="none" stroke={A} strokeWidth="3.2" />
          <path d="M32 5v4M32 19v4M23 14h4M37 14h4" stroke={A} strokeWidth="3" strokeLinecap="round" />
        </svg>
      );
    case 'etesalat-felezi': // pipe elbow fitting
      return (
        <svg {...common}>
          <path d="M14 50V26a12 12 0 0112-12h24" fill="none" stroke="currentColor" strokeWidth="12" strokeLinecap="round" />
          <path d="M14 50V26a12 12 0 0112-12h24" fill="none" stroke={A} strokeWidth="3" strokeLinecap="round" opacity="0.9" />
        </svg>
      );
    case 'flanj-va-etesalat': // flange ring — bolt holes at N/E/S/W
      return (
        <svg {...common}>
          <circle cx="32" cy="32" r="22" fill="currentColor" />
          <circle cx="32" cy="32" r="10" fill="#0a0d11" />
          <circle cx="32" cy="12" r="3.2" fill={A} />
          <circle cx="32" cy="52" r="3.2" fill={A} />
          <circle cx="12" cy="32" r="3.2" fill={A} />
          <circle cx="52" cy="32" r="3.2" fill={A} />
        </svg>
      );
    case 'felezat-rangi': // non-ferrous metals — stacked ingots, echoes rebar's opacity-tiered bundle
      return (
        <svg {...common}>
          <rect x="10" y="36" width="30" height="10" rx="5" fill="currentColor" opacity="0.55" transform="rotate(-8 25 41)" />
          <rect x="16" y="24" width="30" height="10" rx="5" fill="currentColor" opacity="0.8" transform="rotate(-8 31 29)" />
          <rect x="22" y="12" width="30" height="10" rx="5" fill="currentColor" transform="rotate(-8 37 17)" />
          <circle cx="49" cy="15" r="3" fill={A} />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="32" cy="32" r="20" fill="currentColor" />
        </svg>
      );
  }
}

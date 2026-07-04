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
  const A = '#178261'; // emerald (brand) accent

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
    default:
      return (
        <svg {...common}>
          <circle cx="32" cy="32" r="20" fill="currentColor" />
        </svg>
      );
  }
}

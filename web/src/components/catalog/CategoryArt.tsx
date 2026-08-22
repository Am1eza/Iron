/**
 * Category artwork — one line family, ONE stroke weight.
 *
 * Replaces the previous version, whose seven different stroke widths (3, 4,
 * 4.5, 5, 6, 7, 9 on a 64 grid) and opacities (0.4–0.95) made neighbouring
 * icons read as different families. Everything here is drawn on the 24 grid
 * with the stroke as a live property, so recolouring and resizing are CSS.
 *
 * Optical sizing: the stroke is recomputed per size, never scaled, and at
 * 16/20 px the profile switches to its micro master — the section's centreline
 * (I, H, L, U, T) instead of its wall thickness, which is what keeps نبشی,
 * ناودانی and سپری distinguishable in a 16 px menu row.
 *
 * Rebar is the documented exception: a skeletal bar is a single line, so it
 * keeps the closed bar at every size and only drops a rib.
 */
type Props = { slug: string; size?: number };

/** Rendered stroke per size (px), per the iconography spec. */
function strokeFor(size: number) {
  const target = size <= 16 ? 1.25 : size <= 20 ? 1.5 : size <= 24 ? 1.75 : 2;
  return (target * 24) / size;
}

export function CategoryArt({ slug, size = 64 }: Props) {
  const micro = size <= 20;
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: strokeFor(size),
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false,
  } as const;

  switch (slug) {
    case 'rebar':
      return micro
        ? (<svg {...common}><rect x="2.5" y="8.2" width="19" height="7.6" rx="3.8"/><path d="M10 8.4 8.7 15.6M15.5 8.4 14.2 15.6"/></svg>)
        : (<svg {...common}><rect x="2.5" y="8.5" width="19" height="7" rx="3.5"/><path d="M8.2 8.6 6.9 15.4M12.7 8.6 11.4 15.4M17.2 8.6 15.9 15.4"/></svg>);
    case 'ibeam':
      return micro
        ? (<svg {...common}><path d="M8 4H16M8 20H16M12 4V20"/></svg>)
        : (<svg {...common}><path d="M7.5 3H16.5V6.2H13.6V17.8H16.5V21H7.5V17.8H10.4V6.2H7.5Z"/></svg>);
    case 'profile':
      return micro
        ? (<svg {...common}><path d="M4 4H20V20H4Z"/><path d="M9 9H15V15H9Z"/></svg>)
        : (<svg {...common}><path d="M4 4H20V20H4Z"/><path d="M8.5 8.5H15.5V15.5H8.5Z"/></svg>);
    case 'sheet':
    case 'varagh-garm':
    case 'varagh-sard':
    case 'varagh-steel':
      return micro
        ? (<svg {...common}><path d="M3.5 8 12 11.5 20.5 8"/><path d="M3.5 12 12 15.5 20.5 12"/><path d="M3.5 16 12 19.5 20.5 16"/></svg>)
        : (<svg {...common}><path d="M12 3 20.5 6.7 12 10.4 3.5 6.7Z"/><path d="M3.5 6.7V8.6L12 12.3 20.5 8.6V6.7"/><path d="M3.5 11V12.9L12 16.6 20.5 12.9V11"/><path d="M3.5 15.3V17.2L12 20.9 20.5 17.2V15.3"/></svg>);
    case 'angle-channel':
      return micro
        ? (<svg {...common}><path d="M6 4V18H20"/></svg>)
        : (<svg {...common}><path d="M4.5 4H8V16.5H20V20H4.5Z"/></svg>);
    case 'pipe':
      return micro
        ? (<svg {...common}><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/></svg>)
        : (<svg {...common}><ellipse cx="7.5" cy="12" rx="3.2" ry="7"/><ellipse cx="7.5" cy="12" rx="1.5" ry="3.4"/><path d="M7.5 5H16.5a3.2 7 0 0 1 0 14H7.5"/></svg>);
    case 'steel':
      return micro
        ? (<svg {...common}><path d="M12 3.5 20 8V16L12 20.5 4 16V8Z"/></svg>)
        : (<svg {...common}><path d="M12 3.5 20 8V16L12 20.5 4 16V8Z"/><path d="M12 8.6 16.4 11.2V15.8L12 18.4 7.6 15.8V11.2Z"/></svg>);
    case 'felezat-rangi':
      return micro
        ? (<svg {...common}><path d="M4 20H17L15.4 16H5.6Z"/><path d="M6.6 16H19.6L18 12H8.2Z"/></svg>)
        : (<svg {...common}><path d="M4 20H17L15.4 16H5.6Z"/><path d="M6.6 16H19.6L18 12H8.2Z"/><path d="M9.2 12H17.6L16.4 8.8H10.4Z"/></svg>);
    case 'wire':
      return micro
        ? (<svg {...common}><path d="M15.9 4.5 12 3.8a8.2 8.2 0 0 1 8.2 8.2 7.7 7.7 0 0 1-8.2 7.7 7.1 7.1 0 0 1-7.1-7.7 6.4 6.4 0 0 1 7.1-6.4 5.6 5.6 0 0 1 5.2 6.4 4.6 4.6 0 0 1-5.2 4.4"/></svg>)
        : (<svg {...common}><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.1"/><path d="M15.7 9.9 17.7 6.2M11.6 7.5 8.7 4.4M7.7 10.8 4 12.7M9.6 15.9 10.2 19.9"/></svg>);
    case 'shiralat-sanati':
      return micro
        ? (<svg {...common}><path d="M4 8 11 12 4 16Z"/><path d="M20 8 13 12 20 16Z"/><path d="M12 12V6.5M9 5h6"/></svg>)
        : (<svg {...common}><path d="M4 8 11 12 4 16Z"/><path d="M20 8 13 12 20 16Z"/><path d="M12 12V6.5"/><path d="M8.5 5h7"/></svg>);
    case 'etesalat-felezi':
      return micro
        ? (<svg {...common}><path d="M6 20V12A6 6 0 0 1 12 6H20"/></svg>)
        : (<svg {...common}><path d="M5 20V12A7 7 0 0 1 12 5H20V9H12A3 3 0 0 0 9 12V20Z"/></svg>);
    case 'flanj-va-etesalat':
      return micro
        ? (<svg {...common}><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.8"/><path d="M12 5.6h.01M12 18.4h.01"/></svg>)
        : (<svg {...common}><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.6"/><path d="M12 5.4h.01M12 18.6h.01M5.4 12h.01M18.6 12h.01"/></svg>);
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
        </svg>
      );
  }
}

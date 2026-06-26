/** Custom line-icon set (iconography.md): 24-grid, 1.75 stroke, currentColor. */
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 20, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const MenuIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </Svg>
);
export const CloseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);
export const SearchIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </Svg>
);
export const UserIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c0-3.5 3.6-6 8-6s8 2.5 8 6" />
  </Svg>
);
export const BellIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 9a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6z" />
    <path d="M10 20a2 2 0 004 0" />
  </Svg>
);
export const CartIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 4h2l2.2 11.2a1 1 0 001 .8h8.6a1 1 0 001-.8L20 8H6" />
    <circle cx="9" cy="20" r="1.4" />
    <circle cx="17" cy="20" r="1.4" />
  </Svg>
);
export const HomeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 11l8-6 8 6" />
    <path d="M6 10v9h12v-9" />
  </Svg>
);
export const TagIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 12l9-9 9 9-9 9z" />
    <circle cx="9" cy="9" r="1.3" />
  </Svg>
);
export const ChevronDownIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 9l6 6 6-6" />
  </Svg>
);
/** Points to the inline-start (right in RTL); flips via .icon--rtl. */
export const ChevronStartIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15 6l-6 6 6 6" />
  </Svg>
);
export const SparkIcon = (p: IconProps) => (
  <Svg {...p} stroke="none" fill="currentColor">
    <path d="M12 3c.4 5 1 6 6 6.5-5 .5-5.6 1.5-6 6.5-.4-5-1-6-6-6.5 5-.5 5.6-1.5 6-6.5z" />
  </Svg>
);

/** Product-category glyphs (structural silhouettes). */
export function CategoryGlyph({ iconId, size = 28 }: { iconId: string; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false,
  };
  switch (iconId) {
    case 'cat-ibeam':
      return (
        <svg {...common}>
          <path d="M5 5h14M5 19h14M12 5v14" />
        </svg>
      );
    case 'cat-rebar':
      return (
        <svg {...common}>
          <path d="M8 4v16" />
          <path d="M8 7l4-2M8 12l4-2M8 17l4-2" />
        </svg>
      );
    case 'cat-profile':
      return (
        <svg {...common}>
          <rect x="5" y="5" width="14" height="14" rx="1.5" />
          <rect x="8.5" y="8.5" width="7" height="7" rx="1" />
        </svg>
      );
    case 'cat-hot-sheet':
      return (
        <svg {...common}>
          <path d="M4 9l13-3 3 3-13 3z" />
          <path d="M7 12v3l13-3" />
        </svg>
      );
    case 'cat-cold-sheet':
      return (
        <svg {...common}>
          <ellipse cx="9" cy="12" rx="5" ry="7" />
          <path d="M9 5h7M9 19h7" />
          <ellipse cx="16" cy="12" rx="2" ry="3" />
        </svg>
      );
    case 'cat-angle-channel':
      return (
        <svg {...common}>
          <path d="M7 4v13h10" />
          <path d="M7 4h3v13" />
        </svg>
      );
    case 'cat-pipe':
      return (
        <svg {...common}>
          <ellipse cx="8" cy="12" rx="3" ry="7" />
          <path d="M8 5h8a3 7 0 010 14H8" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="7" />
        </svg>
      );
  }
}

/* ============================================================================
   Extended set (Phase 3 — UI Engineering). Same 24-grid / 1.75 stroke language.
   Directional icons carry a note; mirror them in RTL via the `.icon--rtl` util.
   ============================================================================ */

export const ChevronEndIcon = (p: IconProps) => (
  // points to the inline-end (left in RTL); flip via .icon--rtl
  <Svg {...p}>
    <path d="M9 6l6 6-6 6" />
  </Svg>
);
export const ArrowEndIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);
export const FilterIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 5h18M6 12h12M10 19h4" />
  </Svg>
);
export const SortIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 4v16M7 4l-3 3M7 4l3 3M17 20V4M17 20l-3-3M17 20l3-3" />
  </Svg>
);
export const DownloadIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4v11M8 11l4 4 4-4M5 20h14" />
  </Svg>
);
export const PrintIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 9V4h10v5" />
    <path d="M6 18H5a2 2 0 01-2-2v-3a2 2 0 012-2h14a2 2 0 012 2v3a2 2 0 01-2 2h-1" />
    <rect x="7" y="15" width="10" height="6" rx="1" />
  </Svg>
);
export const SheetIcon = (p: IconProps) => (
  // spreadsheet / Excel export
  <Svg {...p}>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <path d="M4 10h16M4 15h16M10 4v16" />
  </Svg>
);
export const ImageIcon = (p: IconProps) => (
  // image-with-logo export
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="8.5" cy="9.5" r="1.5" />
    <path d="M21 16l-5-5L5 20" />
  </Svg>
);
export const ChartIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 19V5M4 19h16" />
    <path d="M7 15l4-5 3 3 4-6" fill="none" />
  </Svg>
);
export const HeartIcon = (p: IconProps & { filled?: boolean }) => (
  <Svg {...p} fill={p.filled ? 'currentColor' : 'none'}>
    <path d="M12 20s-7-4.5-9.2-8.4C1.2 8.5 2.6 5 6 5c2 0 3.2 1.3 4 2.5C10.8 6.3 12 5 14 5c3.4 0 4.8 3.5 3.2 6.6C19 15.5 12 20 12 20z" />
  </Svg>
);
export const StarIcon = (p: IconProps & { filled?: boolean }) => (
  <Svg {...p} fill={p.filled ? 'currentColor' : 'none'}>
    <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.6 1-5.8L3.5 9.7l5.9-.9z" />
  </Svg>
);
export const ShareIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="18" cy="5" r="2.5" />
    <circle cx="6" cy="12" r="2.5" />
    <circle cx="18" cy="19" r="2.5" />
    <path d="M8.2 10.8l7.6-4.6M8.2 13.2l7.6 4.6" />
  </Svg>
);
export const PhoneIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 4h3l1.5 4-2 1.5a12 12 0 005 5l1.5-2 4 1.5v3a2 2 0 01-2 2A15 15 0 013 6a2 2 0 012-2z" />
  </Svg>
);
export const WhatsappIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3a9 9 0 00-7.7 13.6L3 21l4.5-1.2A9 9 0 1012 3z" />
    <path d="M8.5 8.5c-.3 1 0 2.2 1 3.4s2.2 1.9 3.4 2.1c.7.1 1.3-.4 1.5-1l-1.6-1-1 .7c-.6-.3-1.2-.9-1.6-1.6l.7-1-1-1.6z" />
  </Svg>
);
export const TelegramIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M21 5L3 12l5 1.8L18 7l-7.5 8.2L10 20l3-3 4 2.8z" />
  </Svg>
);
export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12.5l4.5 4.5L19 7" />
  </Svg>
);
export const CheckCircleIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 12.5l2.5 2.5L16 9.5" />
  </Svg>
);
export const InfoIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </Svg>
);
export const WarningIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4L2.5 20h19z" />
    <path d="M12 10v4M12 17h.01" />
  </Svg>
);
export const CalendarIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="5" width="16" height="16" rx="2" />
    <path d="M4 10h16M8 3v4M16 3v4" />
  </Svg>
);
export const ClockIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
);
export const PlusIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);
export const MinusIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12h14" />
  </Svg>
);
export const TrashIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
  </Svg>
);
export const EditIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20h4L19 9l-4-4L4 16z" />
    <path d="M14 6l4 4" />
  </Svg>
);
export const ExternalIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 01-2 2H6a2 2 0 01-2-2V8a2 2 0 012-2h4" />
  </Svg>
);
export const CopyIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a2 2 0 012-2h8" />
  </Svg>
);
export const RefreshIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 12a8 8 0 0113.7-5.7L20 8M20 4v4h-4" />
    <path d="M20 12a8 8 0 01-13.7 5.7L4 16M4 20v-4h4" />
  </Svg>
);
export const OfflineIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12.5a10 10 0 0114 0M8.5 16a5 5 0 017 0M12 19.5h.01" />
    <path d="M3 3l18 18" />
  </Svg>
);

/** Structural I-beam glyph for empty/zero states (decorative). */
export const IBeamGlyph = ({ size = 48 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 48 48"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M12 12h24M12 36h24M24 12v24" />
  </svg>
);

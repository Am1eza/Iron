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
export const BellIcon = ({ filled, ...p }: IconProps & { filled?: boolean }) => (
  <Svg {...p} fill={filled ? 'currentColor' : 'none'}>
    {/* Flared bell with a straight rim. The old body was a lopsided lump once
        `filled`, because its shoulders and rim were drawn asymmetrically. */}
    <path d="M6.8 10a5.2 5.2 0 0 1 10.4 0c0 2.9.6 4.4 1.4 5.4a.9.9 0 0 1-.7 1.5H6.1a.9.9 0 0 1-.7-1.5c.8-1 1.4-2.5 1.4-5.4z" />
    <path d="M10.1 19.6a2.1 2.1 0 0 0 3.8 0" />
  </Svg>
);
export const CartIcon = (p: IconProps) => (
  <Svg {...p}>
    {/* Handle and basket are separate subpaths so the basket closes; the old
        single path left the top-left corner open and the sides unequal. */}
    <path d="M2.8 4h2.4l1.2 4.5" />
    <path d="M6.4 8.5h13.8l-1.9 6.4a1.6 1.6 0 0 1-1.5 1.1H9.9a1.6 1.6 0 0 1-1.6-1.2z" />
    <circle cx="10.6" cy="19.4" r="1.4" />
    <circle cx="16.4" cy="19.4" r="1.4" />
  </Svg>
);
export const HomeIcon = (p: IconProps) => (
  <Svg {...p}>
    {/* One closed pentagon: the old roof line and wall tops were 0.5 apart,
        which notched both eaves. Door added so it reads as a house at 22px. */}
    <path d="M3.6 10.8 12 4.2l8.4 6.6V19a1.2 1.2 0 0 1-1.2 1.2H4.8A1.2 1.2 0 0 1 3.6 19z" />
    <path d="M9.5 20.2v-4.9a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v4.9" />
  </Svg>
);
/** Price tag (قیمت‌ها). Was a bare rhombus with an off-centre dot, which read
    as a diamond/lozenge, not a tag. */
export const TagIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M11.5 3.5h8a1 1 0 0 1 1 1v8a2 2 0 0 1-.6 1.4l-6.5 6.5a2 2 0 0 1-2.8 0l-7-7a2 2 0 0 1 0-2.8l6.5-6.5a2 2 0 0 1 1.4-.6z" />
    <circle cx="16.4" cy="7.6" r="1.5" />
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
/**
 * The آهن‌تایم advisor mark — a consult bubble with the I-beam cross-section
 * (the logo mark, iconography.md §4) knocked out of it. Replaces the former
 * 4-point "spark", which was the generic AI-product sparkle every chat tool
 * ships and read as stock rather than as this brand.
 *
 * Filled (not stroked) on purpose: it renders at 14px inside chat rows and
 * at 24px inside the bottom bar's amber orb, and an outlined composite closes
 * up below ~18px. `fillRule="evenodd"` is what makes the beam a hole, so the
 * mark inherits `currentColor` on light, dark and amber surfaces alike.
 */
export const AiMarkIcon = (p: IconProps) => (
  <Svg {...p} stroke="none" fill="currentColor">
    <path
      fillRule="evenodd"
      d="M7.4 4.2h9.2A3.4 3.4 0 0 1 20 7.6v6.6a3.4 3.4 0 0 1-3.4 3.4h-.9v3.4a.6.6 0 0 1-1 .47l-5-3.87H7.4A3.4 3.4 0 0 1 4 14.2V7.6a3.4 3.4 0 0 1 3.4-3.4zM8.6 7.8h6.8v1.4h-2.6v3.4h2.6v1.4H8.6v-1.4h2.6V9.2H8.6z"
    />
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
      // Ribbed rod (آجدار): a centred round-ended bar with rib ticks across it.
      // The old glyph was a bare line at x=8 with ticks hanging off one side,
      // leaving the right half of the box empty.
      return (
        <svg {...common}>
          <rect x="9.2" y="3.5" width="5.6" height="17" rx="2.8" />
          <path d="M9.4 8.6 14.6 6.4M9.4 13.1 14.6 10.9M9.4 17.6 14.6 15.4" />
        </svg>
      );
    case 'cat-profile':
      // Hollow square tube in slight isometric with an open end (iconography
      // §4). Square-in-a-square read as a generic frame, not as a section.
      return (
        <svg {...common}>
          <rect x="4.5" y="9" width="10.5" height="10.5" rx="1" />
          <rect x="7.8" y="12.3" width="3.9" height="3.9" rx=".6" />
          <path d="M4.5 9 8 5.5h10.5V16L15 19.5M15 9l3.5-3.5" />
        </svg>
      );
    case 'cat-hot-sheet':
      // Flat plate with visible thickness, isometric and symmetric about x=12.
      // The old pair of paths left a stray line floating off the plate.
      return (
        <svg {...common}>
          <path d="M12 6.7 21 10.2l-9 3.5-9-3.5z" />
          <path d="M3 10.2v2.9l9 3.5 9-3.5v-2.9M12 13.7v2.9" />
        </svg>
      );
    case 'cat-cold-sheet':
      // Coil (کلاف): a roll whose end face carries a spiral — that spiral is
      // what separates it from `cat-pipe`. The old glyph was two unconnected
      // ellipses of different sizes and read as a keyhole.
      return (
        <svg {...common}>
          <ellipse cx="8" cy="12" rx="4" ry="7.8" />
          <path d="M8 4.2h7.5a4 7.8 0 0 1 0 15.6H8" />
          <path d="M8 6.6a2.9 5.5 0 0 1 0 11 1.9 3.6 0 0 1 0-7.2 1 1.9 0 0 1 0 3.8" />
        </svg>
      );
    case 'cat-angle-channel':
      // The pair the category actually covers: an L-angle section beside a
      // U-channel section, both drawn with wall thickness so they read as
      // rolled sections rather than as letters. The old glyph showed only the
      // angle, and its two paths overlapped into a single flat L.
      return (
        <svg {...common}>
          <path d="M4.2 5h2.9v11.1H11V19H4.2z" />
          <path d="M13 5h2.9v11.1h1.9V5h2.9v14H13z" />
        </svg>
      );
    case 'cat-pipe':
      // Cylinder with an elliptical bore (annulus end). The bore is what makes
      // it a pipe rather than a solid bar.
      return (
        <svg {...common}>
          <ellipse cx="7.5" cy="12" rx="3" ry="7" />
          <ellipse cx="7.5" cy="12" rx="1.3" ry="3.2" />
          <path d="M7.5 5h9a3 7 0 0 1 0 14h-9" />
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
    {/* The body's bottom edge is broken exactly where the output tray meets it,
        so tray and chassis no longer cross each other with fill:none. */}
    <path d="M7 8.5V4.2h10v4.3" />
    <path d="M7 17.5H5.2A2.2 2.2 0 0 1 3 15.3v-4.6a2.2 2.2 0 0 1 2.2-2.2h13.6a2.2 2.2 0 0 1 2.2 2.2v4.6a2.2 2.2 0 0 1-2.2 2.2H17" />
    <path d="M7 14.2h10v5.6H7z" />
    <path d="M17.6 11.5h.01" />
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
export const HeartIcon = ({ filled, ...p }: IconProps & { filled?: boolean }) => (
  <Svg {...p} fill={filled ? 'currentColor' : 'none'}>
    {/* Every control point on the right mirrors its partner around x=12; the
        previous path did not, which put a visible kink in the right lobe. */}
    <path d="M12 20.3C12 20.3 3 15 3 9.4 3 6.6 5.1 4.5 7.7 4.5c1.9 0 3.5 1.1 4.3 2.7.8-1.6 2.4-2.7 4.3-2.7 2.6 0 4.7 2.1 4.7 4.9 0 5.6-9 10.9-9 10.9z" />
  </Svg>
);
export const StarIcon = ({ filled, ...p }: IconProps & { filled?: boolean }) => (
  <Svg {...p} fill={filled ? 'currentColor' : 'none'}>
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
export const MicIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="9" y="3.5" width="6" height="11" rx="3" />
    <path d="M5.5 11.5a6.5 6.5 0 0013 0" />
    <path d="M12 18v2.5" />
  </Svg>
);
export const PhoneIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 4h3l1.5 4-2 1.5a12 12 0 005 5l1.5-2 4 1.5v3a2 2 0 01-2 2A15 15 0 013 6a2 2 0 012-2z" />
  </Svg>
);
export const WhatsappIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.2a8.8 8.8 0 0 0-7.6 13.2l-1.2 4.4 4.5-1.2A8.8 8.8 0 1 0 12 3.2z" />
    {/* Handset redrawn as one closed receiver; the old inner path was a cluster
        of 0.7-unit strokes that turned to mud below 20px. */}
    <path d="M9.3 8.2a1 1 0 0 1 1-.5l1.1.2.5 2.2-1 .9a5.6 5.6 0 0 0 2.1 2.1l.9-1 2.2.5.2 1.1a1 1 0 0 1-.5 1c-3.1 1.3-7.9-3.5-6.5-6.5z" />
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
/* Pause/Play for the ticker's WCAG 2.2.2 control. Drawn as SVG paths, never
   as the ⏸/▶ emoji characters — those render as a tofu box on iOS Safari,
   which is why the earlier attempt at this control was rejected. Filled
   (not stroked) so they stay legible at the 16px the 36px-tall strip allows. */
export const PauseIcon = (p: IconProps) => (
  <Svg {...p} fill="currentColor" stroke="none">
    <path d="M8 5h3v14H8zM13 5h3v14h-3z" />
  </Svg>
);
export const PlayIcon = (p: IconProps) => (
  <Svg {...p} fill="currentColor" stroke="none">
    <path d="M8 5l11 7-11 7z" />
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
export const GlobeIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.6 4 5.8 4 9s-1.5 6.4-4 9c-2.5-2.6-4-5.8-4-9s1.5-6.4 4-9z" />
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
    <path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01" />
    {/* Slash trimmed to the arcs' own bounding box — it used to run corner to
        corner and dangle in empty space at both ends. */}
    <path d="M6.5 9 17.5 20" />
  </Svg>
);
/** Exchange / bourse — a columned institution (بورس کالا). */
export const BankIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 9l8-5 8 5" />
    <path d="M5 9.5v7.5M9.7 9.5v7.5M14.3 9.5v7.5M19 9.5v7.5" />
    <path d="M3 20h18M4 17h16" />
  </Svg>
);
/** Letter of credit / guarantee — a document with a seal (LC). */
export const ShieldIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
    <path d="M9 12l2 2 4-4" />
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

export const SunIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Svg>
);

export const MoonIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z" />
  </Svg>
);

/** Overflow menu (⋯). Dots as a round-capped path — three <circle>s at 14px
    render too faint next to the stroked icons beside them. */
export const MoreIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12h.01M12 12h.01M19 12h.01" />
  </Svg>
);

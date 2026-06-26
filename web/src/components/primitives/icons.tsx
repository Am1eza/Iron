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

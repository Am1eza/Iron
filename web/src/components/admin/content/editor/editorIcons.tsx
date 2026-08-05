/**
 * Editor-only glyphs (US-12.4) — same 24-grid / 1.75-stroke / currentColor
 * contract as `primitives/icons.tsx` (iconography.md), kept in the editor
 * folder rather than added to the shared set because every one of them is
 * meaningless outside a text toolbar and the shared file is imported by public
 * pages.
 *
 * None of these is ever the only label on a control: each toolbar button
 * renders its Persian word beside the glyph. The audience for this editor is
 * explicitly non-technical, and «B» in a box does not mean "bold" to someone
 * who has never used an English word processor.
 */
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 18, children, ...rest }: IconProps & { children: React.ReactNode }) {
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

export const BoldIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 5h6.5a3.5 3.5 0 0 1 0 7H7z" />
    <path d="M7 12h7.5a3.5 3.5 0 0 1 0 7H7z" />
  </Svg>
);

export const ItalicIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15 5h-5M14 19H9M14 5l-4 14" />
  </Svg>
);

export const HeadingIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 5v14M16 5v14M6 12h10" />
  </Svg>
);

export const SubheadingIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 7v10M14 7v10M6 12h8" />
    <path d="M18 14v3" />
  </Svg>
);

export const BulletListIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <circle cx="4.5" cy="6" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="4.5" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="4.5" cy="18" r="1.2" fill="currentColor" stroke="none" />
  </Svg>
);

export const OrderedListIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 6h10M10 12h10M10 18h10" />
    <path d="M4 5.5 5.2 5v3.2M3.6 15.2c0-.7.6-1.2 1.3-1.2s1.2.5 1.2 1.1c0 1.1-2.5 1.6-2.5 3.1h2.6" />
  </Svg>
);

export const QuoteIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 7H5v5h4v-1c0 2.5-1 3.7-2.6 4.4M19 7h-4v5h4v-1c0 2.5-1 3.7-2.6 4.4" />
  </Svg>
);

export const LinkIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1.2 1.2" />
    <path d="M14 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1.2-1.2" />
  </Svg>
);


export const TableIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <path d="M3.5 9.5h17M9.5 9.5v10M15 9.5v10" />
  </Svg>
);

export const ChartBarIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20V4" />
    <path d="M4 20h16" />
    <rect x="7" y="12" width="3.2" height="5" rx="1" />
    <rect x="13" y="8" width="3.2" height="9" rx="1" />
  </Svg>
);

export const ChartLineIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20V4M4 20h16" />
    <path d="M7 15.5 11 11l3 2.5 4-6" />
  </Svg>
);

export const PictureIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="14" rx="2" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="M4.5 17.5 9.5 13l3.5 3 2.5-2 4 4" />
  </Svg>
);

export const RuleIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 12h16" />
    <path d="M7 7h10M7 17h10" opacity="0.4" />
  </Svg>
);

export const UndoIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 8H5V4" />
    <path d="M5.5 8.5A7 7 0 1 1 5 14" />
  </Svg>
);

export const RedoIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15 8h4V4" />
    <path d="M18.5 8.5A7 7 0 1 0 19 14" />
  </Svg>
);

export const RowPlusIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="4" width="17" height="6" rx="1.5" />
    <path d="M12 14v6M9 17h6" />
  </Svg>
);

export const ColumnPlusIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="14" y="3.5" width="6" height="17" rx="1.5" />
    <path d="M7 9v6M4 12h6" />
  </Svg>
);

export const RowMinusIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="4" width="17" height="6" rx="1.5" />
    <path d="M9 17h6" />
  </Svg>
);

export const ColumnMinusIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="14" y="3.5" width="6" height="17" rx="1.5" />
    <path d="M4 12h6" />
  </Svg>
);

export const HeaderRowIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <path d="M3.5 9.5h17" />
    <path d="M3.5 5.5h17v4h-17z" fill="currentColor" stroke="none" opacity="0.35" />
  </Svg>
);

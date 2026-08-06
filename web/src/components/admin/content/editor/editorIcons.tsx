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

/** H2. The subscript is the same "2" the ordered-list glyph draws, so the two
    read as one hand; the old floating tick read as "H." rather than "H₂". */
export const SubheadingIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 6v12M12.5 6v12M5 12h7.5" />
    <path d="M16.2 15.4c0-1 .8-1.7 1.8-1.7s1.7.7 1.7 1.6c0 1.6-3.5 2.3-3.5 4.4h3.6" />
  </Svg>
);

/* The three list/quote glyphs depict Persian text: markers on the inline-start
   (the RIGHT), lines ragged on the left. They used to be drawn left-to-right,
   so they showed a shape of text this editor never produces. These are not
   flagged `.icon--rtl` — the whole editor is RTL, so they are drawn RTL. */
export const BulletListIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15 6H4M15 12H4M15 18H4" />
    <circle cx="19.5" cy="6" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="19.5" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="19.5" cy="18" r="1.2" fill="currentColor" stroke="none" />
  </Svg>
);

export const OrderedListIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 6H4M14 12H4M14 18H4" />
    <path d="M17.6 5.5 18.8 5v3.2M17.2 15.2c0-.7.6-1.2 1.3-1.2s1.2.5 1.2 1.1c0 1.1-2.5 1.6-2.5 3.1h2.6" />
  </Svg>
);

/** Blockquote drawn as what it produces: a rule on the inline-start (right, in
    Persian) with indented lines. The old pair of hooked squares rendered as the
    digits "55". */
export const QuoteIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M19.5 6.5v11" />
    <path d="M16.5 9h-9M16.5 12.5h-9M16.5 16h-5" />
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
    <path d="M4.5 4v15.5h15.5" />
    {/* Bars sit on the axis. They used to stop at y=17 with the axis at y=20,
        so both floated three units above the baseline. */}
    <rect x="8" y="11" width="3.4" height="8.5" rx=".8" />
    <rect x="14" y="7.5" width="3.4" height="12" rx=".8" />
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

/* The four table-edit glyphs share one sentence: "here is the table, and here
   is the row/column being added or removed". Previously the table was a lone
   pill, which read as a battery next to a plus. Columns grow toward the
   inline-start (left, in Persian), matching where a new column lands. */
export const RowPlusIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="3.5" width="17" height="9" rx="1.5" />
    <path d="M3.5 8h17" />
    <path d="M12 15v5.5M9.2 17.75h5.6" />
  </Svg>
);

export const ColumnPlusIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="11.5" y="3.5" width="9" height="17" rx="1.5" />
    <path d="M16 3.5v17" />
    <path d="M6 9.2v5.6M3.2 12h5.6" />
  </Svg>
);

export const RowMinusIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="3.5" width="17" height="9" rx="1.5" />
    <path d="M3.5 8h17" />
    <path d="M9.2 17.75h5.6" />
  </Svg>
);

export const ColumnMinusIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="11.5" y="3.5" width="9" height="17" rx="1.5" />
    <path d="M16 3.5v17" />
    <path d="M3.2 12h5.6" />
  </Svg>
);

export const HeaderRowIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <path d="M3.5 9.5h17" />
    <path d="M3.5 5.5h17v4h-17z" fill="currentColor" stroke="none" opacity="0.35" />
  </Svg>
);

/**
 * Ahantime icon family — 24 grid, ONE stroke weight, currentColor, no fills.
 *
 * Replaces the hand-tuned set. Three things changed, and only three:
 *
 *  1. Stroke is optical, computed per size (16→1.25px, 20→1.5px, 24→1.75px,
 *     32→2px) instead of a fixed 1.75 that rendered as anything from 1.17 to
 *     2.33 depending on where the icon was used. The value is a live SVG
 *     property, so a container's `stroke-width` still wins if a surface needs
 *     to override it.
 *  2. Geometry is redrawn on the 4px sub-grid with round caps and joins. No
 *     opacity anywhere: the previous set used 0.4–0.95 as a second, undeclared
 *     weight axis, which is what made neighbours in one nav rail look like
 *     different families.
 *  3. Product categories carry a 16/20px micro master (see `CategoryGlyph`).
 *
 * Kept deliberately: the AI mark stays filled (an outlined composite closes up
 * below 18px), play/stop stay filled (16px media controls in a 36px strip),
 * heart/bell/star keep their `filled` prop, and `SendIcon` stays a paper plane
 * so that "send" needs no RTL mirror.
 */
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

/** Rendered stroke per display size, per the iconography spec. */
export function strokeFor(size: number) {
  const target = size <= 16 ? 1.25 : size <= 20 ? 1.5 : size <= 24 ? 1.75 : 2;
  return (target * 24) / size;
}

function Svg({ size = 20, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeFor(size)}
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

/** Icon ids that mirror under [dir="rtl"]. Everything else must NOT mirror. */
export const RTL_MIRRORED: ReadonlySet<string> = new Set([
  'cat-etesalat',
  'sub-zprofile',
  'sub-elbow',
  'chevron-start',
  'chevron-end',
  'arrow-start',
  'arrow-end',
  'external',
  'truck',
  'news',
  'login',
  'logout',
  'edit',
  'copy',
  'share',
  'play',
  'toggle',
]);

export const MenuIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 6.5H20M4 12H20M4 17.5H20"/>
  </Svg>
);

export const CloseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5"/>
  </Svg>
);

export const SearchIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="10.8" cy="10.8" r="6.6"/><path d="M15.6 15.6 20.6 20.6"/>
  </Svg>
);

/** Magnifying glass + a mark inside the lens — "nothing found here", not
 *  "search". Reads unambiguously on 404/empty-search states, unlike a bare
 *  `SearchIcon` (which is an action, not a result) or `IBeamGlyph` (an
 *  unrelated brand mark that reads as a capital "I" out of product context). */
export const SearchOffIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="10.8" cy="10.8" r="6.6"/><path d="M15.6 15.6 20.6 20.6"/>
    <path d="M7.5 7.5 14.1 14.1M14.1 7.5 7.5 14.1"/>
  </Svg>
);

export const ChevronDownIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 9.5 12 15.5 18 9.5"/>
  </Svg>
);

export const ChevronUpIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 14.5 12 8.5 18 14.5"/>
  </Svg>
);

/** قبلی — directional: mirror in RTL via `.icon--rtl`. */
export const ChevronStartIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15 5 8 12 15 19"/>
  </Svg>
);

/** بعدی — directional: mirror in RTL via `.icon--rtl`. */
export const ChevronEndIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 5 16 12 9 19"/>
  </Svg>
);

/** بازگشت — directional: mirror in RTL via `.icon--rtl`. */
export const ArrowStartIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M19.5 12H5M11 6 5 12l6 6"/>
  </Svg>
);

/** ادامه — directional: mirror in RTL via `.icon--rtl`. */
export const ArrowEndIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 12H19M13 6l6 6-6 6"/>
  </Svg>
);

export const ArrowUpIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 19.5V5M6.5 10.5 12 5l5.5 5.5"/>
  </Svg>
);

export const ArrowDownIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4.5V19M6.5 13.5 12 19l5.5-5.5"/>
  </Svg>
);

export const HomeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.8 10.6 12 4.4l8.2 6.2V19.5a1 1 0 0 1-1 1H4.8a1 1 0 0 1-1-1Z"/><path d="M9.5 20.5v-5h5v5"/>
  </Svg>
);

export const GridIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 4H10.5V10.5H4ZM13.5 4H20V10.5H13.5ZM4 13.5H10.5V20H4ZM13.5 13.5H20V20H13.5Z"/>
  </Svg>
);

export const ListIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.2 6.5h.01M4.2 12h.01M4.2 17.5h.01"/><path d="M8 6.5H20M8 12H20M8 17.5H20"/>
  </Svg>
);

export const FilterIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 6H20.5M6.5 12H17.5M10 18H14"/>
  </Svg>
);

export const SortIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 4.5V19.5M4 7.5 7 4.5l3 3M17 19.5V4.5M14 16.5l3 3 3-3"/>
  </Svg>
);

export const MoreIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5.5 12h.01M12 12h.01M18.5 12h.01"/>
  </Svg>
);

/** پیوند بیرونی — directional: mirror in RTL via `.icon--rtl`. */
export const ExternalIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 4h6v6M20 4 11.5 12.5"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>
  </Svg>
);

export const GlobeIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5"/><path d="M3.5 12H20.5"/><path d="M12 3.5c2.4 2.5 3.8 5.5 3.8 8.5S14.4 18 12 20.5C9.6 18 8.2 15 8.2 12S9.6 6 12 3.5Z"/>
  </Svg>
);

export const CartIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.8 4.2H5.4L7.9 13.9"/><path d="M7.6 8.6H20.6L18.7 15.2H9.4Z"/><circle cx="10.6" cy="19.1" r="1.5"/><circle cx="17.2" cy="19.1" r="1.5"/>
  </Svg>
);

export const TagIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M11.7 3.5H19a1.5 1.5 0 0 1 1.5 1.5v7.3a2 2 0 0 1-.6 1.4l-6.4 6.4a2 2 0 0 1-2.8 0l-6.8-6.8a2 2 0 0 1 0-2.8l6.4-6.4a2 2 0 0 1 1.4-.6Z"/><circle cx="16.2" cy="7.8" r="1.5"/>
  </Svg>
);

export const DocRequestIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 3.5H14L19 8V20.5H6Z"/><path d="M13.8 3.5V8.2H19"/><path d="M9 12.5H16M9 16H13.5"/>
  </Svg>
);

export const CalculatorIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4.5" y="3" width="15" height="18" rx="2.5"/><rect x="7.5" y="6.2" width="9" height="3.4" rx="1"/><path d="M8.4 13.6h.01M12 13.6h.01M15.6 13.6h.01M8.4 17.4h.01M12 17.4h.01M15.6 17.4h.01"/>
  </Svg>
);

export const WeightIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4.5V19.5M7.5 19.5H16.5"/><path d="M5 9H19"/><path d="M5 9 2.4 13.6a3 3 0 0 0 5.2 0Z"/><path d="M19 9 21.6 13.6a3 3 0 0 1-5.2 0Z"/>
  </Svg>
);

export const BlueprintIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 8H20.5V16H3.5Z"/><path d="M7.5 8V11.5M11.5 8V11.5M15.5 8V11.5"/>
  </Svg>
);

export const WarehouseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 20V10.4L12 5.5 20.5 10.4V20"/><path d="M8 20V14H16V20"/><path d="M8 17H16"/>
  </Svg>
);

/** حمل و ارسال — directional: mirror in RTL via `.icon--rtl`. */
export const TruckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.5 7H13V16.5H2.5Z"/><path d="M13 10.5H16.6L19.5 13.5V16.5H13Z"/><circle cx="6.5" cy="18.4" r="1.6"/><circle cx="16.6" cy="18.4" r="1.6"/>
  </Svg>
);

export const DeliveryClockIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="10.5" cy="10.5" r="7"/><path d="M10.5 6.6V10.5L13.6 12.4"/><path d="M15 16.5H20.5V20.5H15Z"/>
  </Svg>
);

export const FactoryIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 20V11.5L8.5 14.5V11.5L13.5 14.5V8L20.5 12V20Z"/><path d="M7.5 20V16.5M13 20V16.5M18 20V16.5"/>
  </Svg>
);

export const PartnershipIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M11 8.5H8A3.5 3.5 0 0 0 8 15.5H11"/><path d="M13 8.5H16A3.5 3.5 0 0 1 16 15.5H13"/><path d="M9.5 12H14.5"/>
  </Svg>
);

/** اخبار بازار — directional: mirror in RTL via `.icon--rtl`. */
export const NewsIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 6H17.5V19.5H3.5Z"/><path d="M17.5 9.5H20a1 1 0 0 1 1 1V17a2.5 2.5 0 0 1-2.5 2.5"/><path d="M6.5 9.5H14.5M6.5 13H14.5M6.5 16.5H11"/>
  </Svg>
);

export const UsersIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9.5" cy="8.5" r="3.6"/><path d="M3 20c0-3.3 2.9-5.6 6.5-5.6S16 16.7 16 20"/><circle cx="17.2" cy="9.2" r="2.7"/><path d="M17.6 14.6c2.3.3 3.4 2.2 3.4 5.4"/>
  </Svg>
);

export const BankIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 9.5 12 4.5 20 9.5"/><path d="M6 10.5V17M10 10.5V17M14 10.5V17M18 10.5V17"/><path d="M3.5 20H20.5M5 17H19"/>
  </Svg>
);

export const CurrencyIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 7.5H21V16.5H3Z"/><circle cx="12" cy="12" r="2.6"/><path d="M6.5 12h.01M17.5 12h.01"/>
  </Svg>
);

export const CoinIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8"/><path d="M12 7.8V16.2M9.8 10H14.2M9.8 14H14.2"/>
  </Svg>
);

export const TrendingIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 17 9.5 11 13 14.2 20 7"/><path d="M15.5 7H20V11.5"/>
  </Svg>
);

export const ChartIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 4.5V19.5H20"/><path d="M7 15.5 11 10 14 13 18 7.5"/>
  </Svg>
);

export const UserIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8.5" r="4"/><path d="M4.5 20c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6"/>
  </Svg>
);

/** ورود — directional: mirror in RTL via `.icon--rtl`. */
export const LoginIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 4.5H5.5a1 1 0 0 0-1 1V18.5a1 1 0 0 0 1 1H10"/><path d="M13 8.5 16.5 12 13 15.5M8.5 12H16.5"/>
  </Svg>
);

/** خروج — directional: mirror in RTL via `.icon--rtl`. */
export const LogoutIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 4.5H18.5a1 1 0 0 1 1 1V18.5a1 1 0 0 1-1 1H14"/><path d="M8 8.5 4.5 12 8 15.5M4.5 12H12.5"/>
  </Svg>
);

export const BellIcon = ({ filled, ...p }: IconProps & { filled?: boolean }) => (
  <Svg {...p} fill={filled ? 'currentColor' : 'none'}>
    <path d="M6.8 10a5.2 5.2 0 0 1 10.4 0c0 3 .7 4.5 1.5 5.4H5.3c.8-.9 1.5-2.4 1.5-5.4Z"/><path d="M10 19a2.1 2.1 0 0 0 4 0"/>
  </Svg>
);

export const HeartIcon = ({ filled, ...p }: IconProps & { filled?: boolean }) => (
  <Svg {...p} fill={filled ? 'currentColor' : 'none'}>
    <path d="M12 20.3C12 20.3 3 15 3 9.4 3 6.6 5.1 4.5 7.7 4.5c1.9 0 3.5 1.1 4.3 2.7.8-1.6 2.4-2.7 4.3-2.7 2.6 0 4.7 2.1 4.7 4.9 0 5.6-9 10.9-9 10.9Z"/>
  </Svg>
);

export const StarIcon = ({ filled, ...p }: IconProps & { filled?: boolean }) => (
  <Svg {...p} fill={filled ? 'currentColor' : 'none'}>
    <path d="M12 3.5 14.6 8.8 20.5 9.7 16.2 13.8 17.2 19.6 12 17 6.8 19.6 7.8 13.8 3.5 9.7 9.4 8.8Z"/>
  </Svg>
);

export const MedalIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="14.8" r="5"/><path d="M9.2 10.2 6.5 3.8H17.5L14.8 10.2"/><path d="M12 12.6V17"/>
  </Svg>
);

export const SettingsIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3.2"/><path d="M12 3.5V6.1M12 17.9V20.5M4.8 7.8 7.1 9.1M16.9 14.9 19.2 16.2M4.8 16.2 7.1 14.9M16.9 9.1 19.2 7.8"/>
  </Svg>
);

export const ShieldIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.5 19 6.4V11.4C19 15.8 16.1 19 12 20.5 7.9 19 5 15.8 5 11.4V6.4Z"/><path d="M9.2 12 11.3 14.1 15 10.4"/>
  </Svg>
);

export const PlusIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5V19M5 12H19"/>
  </Svg>
);

export const MinusIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12H19"/>
  </Svg>
);

export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12.5 9.5 17 19 7"/>
  </Svg>
);

/** ویرایش — directional: mirror in RTL via `.icon--rtl`. */
export const EditIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20H8L19 9L15 5L4 16Z"/><path d="M14 6 18 10"/>
  </Svg>
);

export const TrashIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7H20M9.5 7V4.5H14.5V7"/><path d="M6.2 7 7.2 20H16.8L17.8 7"/>
  </Svg>
);

/** کپی — directional: mirror in RTL via `.icon--rtl`. */
export const CopyIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>
  </Svg>
);

export const RefreshIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 12a8 8 0 0 1 13.7-5.7L20 8.5M20 4.5V9H15.5"/><path d="M20 12a8 8 0 0 1-13.7 5.7L4 15.5M4 19.5V15H8.5"/>
  </Svg>
);

export const DownloadIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4V15M7.5 10.5 12 15 16.5 10.5"/><path d="M4.5 19.5H19.5"/>
  </Svg>
);

export const PrintIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 8.5V4.2H17V8.5"/><path d="M7 17.5H5.2A2.2 2.2 0 0 1 3 15.3V10.7A2.2 2.2 0 0 1 5.2 8.5H18.8A2.2 2.2 0 0 1 21 10.7V15.3A2.2 2.2 0 0 1 18.8 17.5H17"/><path d="M7 14.2H17V19.8H7Z"/><path d="M17.6 11.5h.01"/>
  </Svg>
);

export const SheetIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 10H20M4 15H20M10 4V20"/>
  </Svg>
);

export const ImageIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="8.8" cy="9.8" r="1.6"/><path d="M20.5 15.5 15.5 10.5 5 19.5"/>
  </Svg>
);

/** اشتراک‌گذاری — directional: mirror in RTL via `.icon--rtl`. */
export const ShareIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="M8.2 10.8 15.8 6.7M8.2 13.2 15.8 17.3"/>
  </Svg>
);

export const SendIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20.5 3.5 10.2 13.8"/><path d="M20.5 3.5 14.2 20.5 10.2 13 3.5 9Z"/>
  </Svg>
);

export const MicIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0"/><path d="M12 18V20.5"/>
  </Svg>
);

export const StopIcon = (p: IconProps) => (
  <Svg {...p} fill="currentColor" stroke="none">
    <rect x="6.8" y="6.8" width="10.4" height="10.4" rx="2"/>
  </Svg>
);

export const ThumbUpIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 10.5V19.5H4.5a1 1 0 0 1-1-1V11.5a1 1 0 0 1 1-1Z"/><path d="M7 10.5 11 3.5A2.2 2.2 0 0 1 14 5.5V9H18.3A1.8 1.8 0 0 1 20 11.2L18.7 17.2A1.8 1.8 0 0 1 17 18.5H7"/>
  </Svg>
);

export const ThumbDownIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 13.5V4.5H4.5a1 1 0 0 0-1 1V12.5a1 1 0 0 0 1 1Z"/><path d="M7 13.5 11 20.5A2.2 2.2 0 0 0 14 18.5V15H18.3A1.8 1.8 0 0 0 20 12.8L18.7 6.8A1.8 1.8 0 0 0 17 5.5H7"/>
  </Svg>
);

/** پخش — directional: mirror in RTL via `.icon--rtl`. */
export const PlayIcon = (p: IconProps) => (
  <Svg {...p} fill="currentColor" stroke="none">
    <path d="M7.5 4.8 19 12 7.5 19.2Z"/>
  </Svg>
);

export const PauseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8.5 5V19M15.5 5V19"/>
  </Svg>
);

export const CheckCircleIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5"/><path d="M8.2 12.4 10.8 15 15.8 9.6"/>
  </Svg>
);

export const XCircleIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5"/><path d="M9.2 9.2 14.8 14.8M14.8 9.2 9.2 14.8"/>
  </Svg>
);

export const WarningIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4 21 20H3Z"/><path d="M12 9.8V14M12 17h.01"/>
  </Svg>
);

export const InfoIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5"/><path d="M12 11V16.2M12 8h.01"/>
  </Svg>
);

export const ClockIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5"/><path d="M12 7V12L15.4 14.2"/>
  </Svg>
);

export const ClockAlertIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="10.2" cy="12" r="7.2"/><path d="M10.2 7.8V12L13.2 13.8"/><path d="M19.6 8V12.4M19.6 15.6h.01"/>
  </Svg>
);

export const CalendarIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="5.5" width="16" height="15" rx="2"/><path d="M4 10.5H20M8.5 3.2V7M15.5 3.2V7"/>
  </Svg>
);

export const OfflineIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01"/><path d="M6.5 9 17.5 20"/>
  </Svg>
);

export const SunIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4"/><path d="M12 3.5V5.5M12 18.5V20.5M4.9 4.9 6.3 6.3M17.7 17.7 19.1 19.1M3.5 12H5.5M18.5 12H20.5M4.9 19.1 6.3 17.7M17.7 6.3 19.1 4.9"/>
  </Svg>
);

export const MoonIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5 8.5 8.5 0 1 0 20.5 14.5Z"/>
  </Svg>
);

export const PhoneIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 4.2H8.2L9.8 8.4 7.6 10a12 12 0 0 0 6.4 6.4L15.6 14.2 19.8 15.8V19a2 2 0 0 1-2 2A15.8 15.8 0 0 1 3 6.2a2 2 0 0 1 2-2Z"/>
  </Svg>
);

export const LocationIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 20.8S19 14.7 19 10a7 7 0 1 0-14 0c0 4.7 7 10.8 7 10.8Z"/><circle cx="12" cy="10" r="2.6"/>
  </Svg>
);

export const SmsIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 5.5H19.5a1 1 0 0 1 1 1V14.5a1 1 0 0 1-1 1H10L5.5 19.2V15.5H4.5a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1Z"/><path d="M8 10.5h.01M12 10.5h.01M16 10.5h.01"/>
  </Svg>
);

export const TelegramIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20.8 4.6 3.5 11.4 8.4 13.2 18 6.8 10.6 15.2 10.2 19.8 12.8 17.2 16.6 19.6Z"/>
  </Svg>
);

export const WhatsappIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.4A8.6 8.6 0 0 0 4.6 16.3L3.5 20.5 7.9 19.4A8.6 8.6 0 1 0 12 3.4Z"/><path d="M9.4 8.4a1 1 0 0 1 1-.5l1.1.2.5 2.2-1 .9a5.6 5.6 0 0 0 2.1 2.1l.9-1 2.2.5.2 1.1a1 1 0 0 1-.5 1c-3.1 1.3-7.9-3.5-6.5-6.5Z"/>
  </Svg>
);

export const EitaaIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5"/><path d="M7.8 12.6 16.2 8.8 13 17.2 11.2 13.6Z"/>
  </Svg>
);

export const InstagramIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M16.9 7.1h.01"/>
  </Svg>
);

export const DashboardIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 4H10.5V10H4ZM13.5 4H20V14H13.5ZM4 13H10.5V20H4ZM13.5 17H20V20H13.5Z"/>
  </Svg>
);

export const CatalogBoxIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 8 12 4 20.5 8V16L12 20 3.5 16Z"/><path d="M3.5 8 12 12 20.5 8M12 12V20"/>
  </Svg>
);

export const PricingGridIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9.5H20.5M3.5 14.5H20.5M9.5 9.5V19.5M15 9.5V19.5"/>
  </Svg>
);

export const AuditHistoryIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.2 12A8 8 0 1 0 12 4a8 8 0 0 0-6.9 4"/><path d="M4.2 4.8V8.8H8.2"/><path d="M12 8.4V12L14.8 13.8"/>
  </Svg>
);

export const LayersIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.5 20.5 8 12 12.5 3.5 8Z"/><path d="M3.5 12 12 16.5 20.5 12M3.5 15.5 12 20 20.5 15.5"/>
  </Svg>
);

/** کلید — directional: mirror in RTL via `.icon--rtl`. */
export const ToggleIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.5" y="7.5" width="19" height="9" rx="4.5"/><circle cx="16.6" cy="12" r="2.6"/>
  </Svg>
);

export const KanbanIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M9.2 4.5V19.5M14.8 4.5V19.5"/>
  </Svg>
);

/**
 * The آهن‌تایم advisor mark — a consult bubble with the I-beam cross-section
 * knocked out of it. Filled on purpose: it renders at 14px inside chat rows and
 * at 24px inside the bottom bar's amber orb, and an outlined composite closes
 * up below ~18px. `fillRule="evenodd"` is what makes the beam a hole, so the
 * mark inherits `currentColor` on light, dark and amber surfaces alike.
 */
/** A plain speech balloon — the history rail's per-conversation glyph.
 *  Deliberately NOT `AiMarkIcon`, which is the advisor's brand mark: a mark
 *  repeated forty times down a list stops reading as a brand. */
export const ChatIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.5 9.5 0 0 1-2.9-.4L3 21l1.5-4.4A8.1 8.1 0 0 1 3.6 11.5 8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4z" />
  </Svg>
);

export const AiMarkIcon = (p: IconProps) => (
  <Svg {...p} stroke="none" fill="currentColor">
    <path
      fillRule="evenodd"
      d="M7.4 4.2h9.2A3.4 3.4 0 0 1 20 7.6v6.6a3.4 3.4 0 0 1-3.4 3.4h-.9v3.4a.6.6 0 0 1-1 .47l-5-3.87H7.4A3.4 3.4 0 0 1 4 14.2V7.6a3.4 3.4 0 0 1 3.4-3.4zM8.6 7.8h6.8v1.4h-2.6v3.4h2.6v1.4H8.6v-1.4h2.6V9.2H8.6z"
    />
  </Svg>
);

/**
 * Product-category glyphs. Accepts either the icon id (`cat-rebar`) or the
 * catalog slug (`rebar`, `varagh-garm`, …) so existing call sites keep working.
 * At 16/20px it returns the micro master — the section's centreline rather than
 * its wall thickness.
 */
export function CategoryGlyph({ iconId, size = 28 }: { iconId: string; size?: number }) {
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

  switch (iconId) {
    case 'cat-rebar':
    case 'rebar':
      return micro ? (<svg {...common}><rect x="2.5" y="8.2" width="19" height="7.6" rx="3.8"/><path d="M10 8.4 8.7 15.6M15.5 8.4 14.2 15.6"/></svg>) : (<svg {...common}><rect x="2.5" y="8.5" width="19" height="7" rx="3.5"/><path d="M8.2 8.6 6.9 15.4M12.7 8.6 11.4 15.4M17.2 8.6 15.9 15.4"/></svg>);
    case 'cat-ibeam':
    case 'ibeam':
      return micro ? (<svg {...common}><path d="M8 4H16M8 20H16M12 4V20"/></svg>) : (<svg {...common}><path d="M7.5 3H16.5V6.2H13.6V17.8H16.5V21H7.5V17.8H10.4V6.2H7.5Z"/></svg>);
    case 'cat-profile':
    case 'profile':
      return micro ? (<svg {...common}><path d="M4 4H20V20H4Z"/><path d="M9 9H15V15H9Z"/></svg>) : (<svg {...common}><path d="M4 4H20V20H4Z"/><path d="M8.5 8.5H15.5V15.5H8.5Z"/></svg>);
    case 'cat-sheet':
    case 'sheet':
    case 'varagh-garm':
    case 'varagh-sard':
    case 'varagh-steel':
      return micro ? (<svg {...common}><path d="M3.5 8 12 11.5 20.5 8"/><path d="M3.5 12 12 15.5 20.5 12"/><path d="M3.5 16 12 19.5 20.5 16"/></svg>) : (<svg {...common}><path d="M12 3 20.5 6.7 12 10.4 3.5 6.7Z"/><path d="M3.5 6.7V8.6L12 12.3 20.5 8.6V6.7"/><path d="M3.5 11V12.9L12 16.6 20.5 12.9V11"/><path d="M3.5 15.3V17.2L12 20.9 20.5 17.2V15.3"/></svg>);
    case 'cat-angle-channel':
    case 'angle-channel':
      return micro ? (<svg {...common}><path d="M6 4V18H20"/></svg>) : (<svg {...common}><path d="M4.5 4H8V16.5H20V20H4.5Z"/></svg>);
    case 'cat-pipe':
    case 'pipe':
      return micro ? (<svg {...common}><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/></svg>) : (<svg {...common}><ellipse cx="7.5" cy="12" rx="3.2" ry="7"/><ellipse cx="7.5" cy="12" rx="1.5" ry="3.4"/><path d="M7.5 5H16.5a3.2 7 0 0 1 0 14H7.5"/></svg>);
    case 'cat-steel':
    case 'steel':
      return micro ? (<svg {...common}><path d="M12 3.5 20 8V16L12 20.5 4 16V8Z"/></svg>) : (<svg {...common}><path d="M12 3.5 20 8V16L12 20.5 4 16V8Z"/><path d="M12 8.6 16.4 11.2V15.8L12 18.4 7.6 15.8V11.2Z"/></svg>);
    case 'cat-felezat-rangi':
    case 'felezat-rangi':
      return micro ? (<svg {...common}><path d="M4 20H17L15.4 16H5.6Z"/><path d="M6.6 16H19.6L18 12H8.2Z"/></svg>) : (<svg {...common}><path d="M4 20H17L15.4 16H5.6Z"/><path d="M6.6 16H19.6L18 12H8.2Z"/><path d="M9.2 12H17.6L16.4 8.8H10.4Z"/></svg>);
    case 'cat-wire':
    case 'wire':
      return micro ? (<svg {...common}><path d="M15.9 4.5 12 3.8a8.2 8.2 0 0 1 8.2 8.2 7.7 7.7 0 0 1-8.2 7.7 7.1 7.1 0 0 1-7.1-7.7 6.4 6.4 0 0 1 7.1-6.4 5.6 5.6 0 0 1 5.2 6.4 4.6 4.6 0 0 1-5.2 4.4"/></svg>) : (<svg {...common}><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.1"/><path d="M15.7 9.9 17.7 6.2M11.6 7.5 8.7 4.4M7.7 10.8 4 12.7M9.6 15.9 10.2 19.9"/></svg>);
    case 'cat-shiralat':
    case 'shiralat-sanati':
      return micro ? (<svg {...common}><path d="M4 8 11 12 4 16Z"/><path d="M20 8 13 12 20 16Z"/><path d="M12 12V6.5M9 5h6"/></svg>) : (<svg {...common}><path d="M4 8 11 12 4 16Z"/><path d="M20 8 13 12 20 16Z"/><path d="M12 12V6.5"/><path d="M8.5 5h7"/></svg>);
    case 'cat-etesalat':
    case 'etesalat-felezi':
      return micro ? (<svg {...common}><path d="M6 20V12A6 6 0 0 1 12 6H20"/></svg>) : (<svg {...common}><path d="M5 20V12A7 7 0 0 1 12 5H20V9H12A3 3 0 0 0 9 12V20Z"/></svg>);
    case 'cat-flanj':
    case 'flanj-va-etesalat':
      return micro ? (<svg {...common}><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.8"/><path d="M12 5.6h.01M12 18.4h.01"/></svg>) : (<svg {...common}><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.6"/><path d="M12 5.4h.01M12 18.6h.01M5.4 12h.01M18.6 12h.01"/></svg>);
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
        </svg>
      );
  }
}

/** Structural I-beam glyph for empty/zero states (decorative). */
export const IBeamGlyph = ({ size = 48 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeFor(size)}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M7.5 3H16.5V6.2H13.6V17.8H16.5V21H7.5V17.8H10.4V6.2H7.5Z" />
  </svg>
);

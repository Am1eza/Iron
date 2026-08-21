/**
 * Sub-category glyphs — the second level of the icon system `CategoryArt`
 * already establishes for the nine top-level product lines.
 *
 * ## Why a shape and not a photo
 *
 * `productImages.ts` holds one studio photo per CATEGORY, and there are seven
 * of them. Photographing ~70 sub-categories is a procurement job, not a code
 * change, and a menu row is 16px tall anyway — a 16px photo of ورق روغنی and a
 * 16px photo of ورق اسیدشویی are the same grey rectangle. What actually
 * distinguishes these goods at that size is their SECTION: an angle is an L, a
 * channel is a U, a pipe is a ring, a sandwich panel is two skins around a
 * core. That is how the trade itself draws them, and it is what a buyer
 * scanning a 19-row list is matching against.
 *
 * So the glyphs are cross-sections and profiles, drawn to the same rules as
 * `CategoryArt` — uniform stroke, `currentColor` body, no fill, decorative and
 * `aria-hidden` because the row's own Persian label is the accessible name.
 * They inherit the row's colour, so they pick up the accent on hover for free
 * and need no second palette.
 *
 * ## Why resolution is name-first with a slug override
 *
 * The catalog is admin-editable and still growing (`sub_categories` gained
 * eleven rows in the last two months). A hard slug→glyph table would leave
 * every future row iconless, so the primary resolver reads the Persian NAME
 * for the words the taxonomy actually uses — «نبشی», «ناودانی», «لوله»,
 * «تسمه», «توری», «فلنج» — and a new «نبشی آلومینیوم» is drawn correctly the
 * moment an admin types it, with no deploy.
 *
 * The override table exists for the rows whose name does NOT contain its own
 * shape word, which in this catalog is most of ورق: the sub-categories are
 * called «سیاه», «روغنی», «اسیدشویی» — the word ورق lives on the category, not
 * on them. Those are listed explicitly, keyed `category/sub` so `steel/pipe`
 * and `pipe/gas` cannot collide.
 *
 * Anything unresolved falls back to the parent category's own `CategoryArt`,
 * which is always at least true (a ورق sub-category is some kind of ورق), so
 * no row is ever left blank.
 */
import { CategoryArt } from './CategoryArt';

type Glyph =
  | 'plate'
  | 'plateCoated'
  | 'checkered'
  | 'corrugated'
  | 'panel'
  | 'deck'
  | 'strip'
  | 'grating'
  | 'perforated'
  | 'pipe'
  | 'pipeSpiral'
  | 'box'
  | 'squareBar'
  | 'zprofile'
  | 'angle'
  | 'channel'
  | 'tee'
  | 'beam'
  | 'beamH'
  | 'castellated'
  | 'rebar'
  | 'plainBar'
  | 'coupler'
  | 'coil'
  | 'wire'
  | 'mesh'
  | 'flange'
  | 'ring'
  | 'spring';

/**
 * Rows whose Persian name carries no shape word of its own. Keyed
 * `<categorySlug>/<subSlug>` — the pair is what is unique, since `pipe` is a
 * sub-category slug under both `steel` and `felezat-rangi`.
 */
const BY_SLUG: Record<string, Glyph> = {
  // ورق — the sub-categories are finishes («سیاه», «روغنی»), not shapes.
  'sheet/black': 'plate',
  'sheet/oiled': 'plate',
  'sheet/pickled': 'plate',
  'sheet/alloy': 'plate',
  'sheet/steel': 'plate',
  'sheet/wear-resistant': 'plate',
  'sheet/marine': 'plate',
  'sheet/galvanized': 'plateCoated',
  'sheet/colored': 'plateCoated',
  'sheet/aluzinc': 'plateCoated',
  'sheet/tin-coated': 'plateCoated',
  'sheet/checkered': 'checkered',
  'sheet/deck': 'deck',
  'sheet/sandwich-panel': 'panel',
  'sheet/grating': 'grating',
  'sheet/perforated-black': 'perforated',
  // لوله — «گازی», «داربستی», «مبلی» name the use, not the section.
  'pipe/gas': 'pipe',
  'pipe/industrial': 'pipe',
  'pipe/scaffold': 'pipe',
  'pipe/galvanized': 'pipe',
  'pipe/furniture': 'pipe',
  'pipe/seamless': 'pipe',
  'pipe/spiral': 'pipeSpiral',
  // پروفیل و قوطی — «چهارپهلو» is a SOLID square bar, not a hollow section,
  // which is exactly the distinction a buyer is here to make.
  'profile/chaharpahlu': 'squareBar',
  'profile/chaharpahlu-alloy': 'squareBar',
  'profile/congress': 'corrugated',
  'profile/box-square': 'box',
  'profile/box-rect': 'box',
  'profile/column': 'box',
  'profile/frame': 'box',
  'profile/furniture': 'box',
  'profile/galvanized': 'box',
  // میلگرد
  'rebar/deformed': 'rebar',
  'rebar/heat-treated': 'rebar',
  'rebar/alloy': 'rebar',
  'rebar/plain': 'plainBar',
  'rebar/mylgrd-sadh': 'plainBar',
  'rebar/khamut': 'wire',
  'rebar/coil': 'coil',
  'rebar/stirrup': 'wire',
  'rebar/coupler': 'coupler',
  // تیرآهن — «هاش سبک/سنگین» is the H section; «لانه زنبوری» the castellated
  // one. Both are the reason someone opens this category rather than another.
  'ibeam/tirahan': 'beam',
  'ibeam/ipe': 'beam',
  'ibeam/light': 'beam',
  'ibeam/hash-sabok': 'beamH',
  'ibeam/hash-sangin': 'beamH',
  'ibeam/hea': 'beamH',
  'ibeam/heb': 'beamH',
  'ibeam/lane-zanburi': 'castellated',
  'ibeam/castellated': 'castellated',
  // نبشی و ناودانی — «وال پست» is a C stud.
  'angle-channel/val-post': 'channel',
  // کلاف و مفتول
  'wire/coil': 'coil',
  'wire/coil-ribbed': 'coil',
  'wire/tie': 'wire',
  'wire/mesh': 'mesh',
  // فلزات رنگی — «بوشن» is a sleeve/ring fitting.
  'felezat-rangi/copper-bushing': 'ring',
};

/**
 * Shape words as the taxonomy actually spells them, longest-first so «سیم‌جوش»
 * is tested before «سیم» and «ورق کرکره» before «ورق». Matching is on the
 * name, so a sub-category an admin adds tomorrow resolves without a deploy.
 */
const BY_NAME: Array<[string, Glyph]> = [
  ['ساندویچ', 'panel'],
  ['عرشه', 'deck'],
  ['کرکره', 'corrugated'],
  ['شیروانی', 'corrugated'],
  ['گریتینگ', 'grating'],
  ['پانچ', 'perforated'],
  ['کوپلر', 'coupler'],
  ['سیم‌جوش', 'wire'],
  ['سیم جوش', 'wire'],
  ['سیم‌مفتول', 'wire'],
  ['مفتول', 'wire'],
  ['سیم', 'wire'],
  ['کلاف', 'coil'],
  ['توری', 'mesh'],
  ['مش', 'mesh'],
  ['فلنج', 'flange'],
  ['رینگ', 'ring'],
  ['بوشن', 'ring'],
  ['فنر', 'spring'],
  ['تیوب', 'pipe'],
  ['لوله', 'pipe'],
  ['ناودانی', 'channel'],
  ['وال پست', 'channel'],
  ['نبشی', 'angle'],
  ['سپری', 'tee'],
  ['تسمه', 'strip'],
  ['میلگرد', 'rebar'],
  ['هاش', 'beamH'],
  ['لانه', 'castellated'],
  ['تیرآهن', 'beam'],
  ['چهارپهلو', 'squareBar'],
  ['پروفیل Z', 'zprofile'],
  ['قوطی', 'box'],
  ['پروفیل', 'box'],
  ['ورق', 'plate'],
];

/**
 * The glyph for one sub-category, or null when nothing matches.
 *
 * A single-word pattern is matched against the name's WORDS, not against its
 * characters. Persian compounds make a bare substring test actively wrong:
 * «مش» (mesh) is inside «نامشخص», and — the one that would have shipped — it
 * is inside «مشکی», so «ورق مشکی» would have been drawn as woven mesh instead
 * of as a plate. Multi-part patterns («ورق کرکره», «سیم‌جوش») stay substring
 * tests, since they are already specific enough to be safe and have to survive
 * the words around them. Words are split on anything that is not a letter or a
 * digit, plus ZWNJ — «سیم‌مفتول» is two words joined by a zero-width
 * non-joiner, and both halves have to be reachable.
 */
export function subCategoryGlyph(
  categorySlug: string,
  subSlug: string,
  name: string,
): Glyph | null {
  const exact = BY_SLUG[`${categorySlug}/${subSlug}`];
  if (exact) return exact;
  const n = name.trim();
  const words = new Set(n.split(/[^\p{L}\p{N}]+|\u200c/gu).filter(Boolean));
  for (const [pattern, glyph] of BY_NAME) {
    const multipart = /[^\p{L}\p{N}]|\u200c/u.test(pattern);
    if (multipart ? n.includes(pattern) : words.has(pattern)) return glyph;
  }
  return null;
}

export function SubCategoryArt({
  categorySlug,
  slug,
  name,
  size = 16,
}: {
  categorySlug: string;
  slug: string;
  name: string;
  size?: number;
}) {
  const glyph = subCategoryGlyph(categorySlug, slug, name);
  // No glyph matched: the parent category's own artwork is still true of every
  // row under it, so the column never goes ragged with some rows iconed and
  // some not.
  if (!glyph) return <CategoryArt slug={categorySlug} size={size} />;

  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    focusable: false,
  } as const;

  switch (glyph) {
    case 'plate': // two stacked plates in perspective
      return (
        <svg {...common}>
          <path d="M3 9l9-3.5L21 9l-9 3.5z" />
          <path d="M3 14l9 3.5L21 14" opacity="0.55" />
        </svg>
      );
    case 'plateCoated': // a plate with a distinct coated top skin
      return (
        <svg {...common}>
          <path d="M3 11l9-3.5L21 11l-9 3.5z" />
          <path d="M4.5 7.5l7.5-3 7.5 3" strokeDasharray="2 2" />
        </svg>
      );
    case 'checkered': // tread plate — a plate carrying raised ribs
      return (
        <svg {...common}>
          <path d="M3 12l9-3.5L21 12l-9 3.5z" />
          <path
            d="M9 10.4l1.6 1.4M12.5 9.2l1.6 1.4M8.4 13.2l1.6 1.4M12 12l1.6 1.4"
            opacity="0.75"
          />
        </svg>
      );
    case 'corrugated': // rolled sheet — the wave is the product
      return (
        <svg {...common}>
          <path d="M2 14c1.6-4 3.2-4 4.8 0s3.2 4 4.8 0 3.2-4 4.8 0 3.2 4 4.8 0" />
          <path d="M2 18h20" opacity="0.4" />
        </svg>
      );
    case 'panel': // sandwich panel — two skins around a core
      return (
        <svg {...common}>
          <path d="M3 7h18M3 17h18" />
          <path d="M6 9.5v5M10 9.5v5M14 9.5v5M18 9.5v5" opacity="0.5" />
        </svg>
      );
    case 'deck': // composite deck — the trapezoidal rib profile
      return (
        <svg {...common}>
          <path d="M2 16h4l2-6h4l2 6h4l2-6h2" />
        </svg>
      );
    case 'strip': // flat bar — long, thin, rectangular
      return (
        <svg {...common}>
          <rect x="2.5" y="9.5" width="19" height="5" rx="1" />
        </svg>
      );
    case 'grating': // welded grating — bearing bars + cross rods
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="1" />
          <path d="M8 5v14M13 5v14M18 5v14" opacity="0.6" />
          <path d="M3 12h18" opacity="0.6" />
        </svg>
      );
    case 'perforated': // punched sheet
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="1" />
          <g strokeWidth="1.8" opacity="0.7">
            <path d="M8 9.5h.01M12 9.5h.01M16 9.5h.01M8 14.5h.01M12 14.5h.01M16 14.5h.01" />
          </g>
        </svg>
      );
    case 'pipe': // round section
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="4.2" opacity="0.55" />
        </svg>
      );
    case 'pipeSpiral': // spiral-welded — the helical seam is the identifier
      return (
        <svg {...common}>
          <rect x="2.5" y="7" width="19" height="10" rx="5" />
          <path d="M7 7l4 10M13 7l4 10" opacity="0.6" />
        </svg>
      );
    case 'box': // hollow square section
      return (
        <svg {...common}>
          <rect x="4" y="4" width="16" height="16" rx="1.5" />
          <rect x="8" y="8" width="8" height="8" rx="1" opacity="0.55" />
        </svg>
      );
    case 'squareBar': // SOLID square bar — the چهارپهلو / hollow distinction
      return (
        <svg {...common}>
          <rect x="5" y="5" width="14" height="14" rx="1.5" />
          <path d="M8.5 15.5L15.5 8.5M11.5 15.5l4-4" opacity="0.45" />
        </svg>
      );
    case 'zprofile':
      return (
        <svg {...common}>
          <path d="M5 5h7v14h7" />
        </svg>
      );
    case 'angle': // L section
      return (
        <svg {...common}>
          <path d="M6 4v16h14" />
        </svg>
      );
    case 'channel': // U section
      return (
        <svg {...common}>
          <path d="M5 4v16h14V4" />
        </svg>
      );
    case 'tee': // T section
      return (
        <svg {...common}>
          <path d="M4 5h16M12 5v15" />
        </svg>
      );
    case 'beam': // I section
      return (
        <svg {...common}>
          <path d="M5 5h14M5 19h14M12 5v14" />
        </svg>
      );
    case 'beamH': // H section — wider flanges, upright web
      return (
        <svg {...common}>
          <path d="M6 4v16M18 4v16M6 12h12" />
        </svg>
      );
    case 'castellated': // castellated beam — the hexagonal web openings
      return (
        <svg {...common}>
          <path d="M3 6h18M3 18h18" />
          <path d="M7 12l1.6-2.5h3.2L13.4 12l-1.6 2.5H8.6z" opacity="0.7" />
          <path d="M16 9.5l1.4 2.5-1.4 2.5" opacity="0.5" />
        </svg>
      );
    case 'rebar': // ribbed bar
      return (
        <svg {...common}>
          <rect x="2.5" y="9" width="19" height="6" rx="3" />
          <path d="M7 9l-1.4 6M12 9l-1.4 6M17 9l-1.4 6" opacity="0.65" />
        </svg>
      );
    case 'plainBar': // smooth round bar
      return (
        <svg {...common}>
          <rect x="2.5" y="9" width="19" height="6" rx="3" />
        </svg>
      );
    case 'coupler': // threaded sleeve joining two bars
      return (
        <svg {...common}>
          <path d="M2 12h5M17 12h5" />
          <rect x="7" y="8.5" width="10" height="7" rx="1.5" />
          <path d="M10 8.5v7M13 8.5v7" opacity="0.5" />
        </svg>
      );
    case 'coil': // wire rod coil
      return (
        <svg {...common}>
          <ellipse cx="12" cy="12" rx="9" ry="7" />
          <ellipse cx="12" cy="12" rx="3.2" ry="2.4" opacity="0.6" />
        </svg>
      );
    case 'wire': // drawn wire — a loose loop of it
      return (
        <svg {...common}>
          <path d="M3 15c3-6 6 6 9 0s6-6 9 0" />
        </svg>
      );
    case 'mesh': // woven mesh
      return (
        <svg {...common}>
          <path d="M3 8h18M3 12h18M3 16h18" opacity="0.85" />
          <path d="M8 5v14M12 5v14M16 5v14" opacity="0.55" />
        </svg>
      );
    case 'flange': // bolted flange ring
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <circle cx="12" cy="12" r="3.5" opacity="0.55" />
          <g strokeWidth="1.8" opacity="0.75">
            <path d="M12 5.2h.01M12 18.8h.01M5.2 12h.01M18.8 12h.01" />
          </g>
        </svg>
      );
    case 'ring': // plain ring / sleeve
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <circle cx="12" cy="12" r="5" opacity="0.55" />
        </svg>
      );
    case 'spring':
      return (
        <svg {...common}>
          <path d="M5 4h14M5 20h14" />
          <path d="M6 7h12M6 10h12M6 13h12M6 16h12" opacity="0.6" />
        </svg>
      );
  }
}

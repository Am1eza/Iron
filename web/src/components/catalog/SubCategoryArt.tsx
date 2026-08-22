/**
 * Sub-category glyphs — same resolver as before, one redrawn family behind it.
 *
 * The name-first / slug-override resolution is unchanged (and unchanged on
 * purpose: it is what lets an admin add «نبشی آلومینیوم» and get the right
 * shape with no deploy). What changed is the drawing: every glyph is now on the
 * 24 grid with a single stroke weight and no opacity — the previous set used
 * opacity 0.45–0.85 and a second stroke-width of 1.8 as an undeclared weight
 * axis, which is why rows read as unequal.
 *
 * Sizes 16 and 20 get the micro master: the profile's wall thickness is
 * dropped and the section becomes its own centreline. Rebar is the documented
 * exception — it keeps the closed bar and drops a rib instead.
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
  | 'spring'
  | 'billet'
  | 'ingot'
  | 'valve'
  | 'elbow';

/**
 * Rows whose Persian name carries no shape word of its own. Keyed
 * `<categorySlug>/<subSlug>` — the pair is what is unique, since `pipe` is a
 * sub-category slug under both `steel` and `felezat-rangi`.
 */
const BY_SLUG: Record<string, Glyph> = {
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
  'pipe/gas': 'pipe',
  'pipe/industrial': 'pipe',
  'pipe/scaffold': 'pipe',
  'pipe/galvanized': 'pipe',
  'pipe/furniture': 'pipe',
  'pipe/seamless': 'pipe',
  'pipe/spiral': 'pipeSpiral',
  'profile/chaharpahlu': 'squareBar',
  'profile/chaharpahlu-alloy': 'squareBar',
  'profile/congress': 'corrugated',
  'profile/box-square': 'box',
  'profile/box-rect': 'box',
  'profile/column': 'box',
  'profile/frame': 'box',
  'profile/furniture': 'box',
  'profile/galvanized': 'box',
  'profile/z': 'zprofile',
  'rebar/deformed': 'rebar',
  'rebar/heat-treated': 'rebar',
  'rebar/alloy': 'rebar',
  'rebar/plain': 'plainBar',
  'rebar/mylgrd-sadh': 'plainBar',
  'rebar/khamut': 'wire',
  'rebar/coil': 'coil',
  'rebar/stirrup': 'wire',
  'rebar/coupler': 'coupler',
  'ibeam/tirahan': 'beam',
  'ibeam/ipe': 'beam',
  'ibeam/light': 'beam',
  'ibeam/hash-sabok': 'beamH',
  'ibeam/hash-sangin': 'beamH',
  'ibeam/hea': 'beamH',
  'ibeam/heb': 'beamH',
  'ibeam/lane-zanburi': 'castellated',
  'ibeam/castellated': 'castellated',
  'angle-channel/val-post': 'channel',
  'angle-channel/tbar': 'tee',
  'wire/coil': 'coil',
  'wire/coil-ribbed': 'coil',
  'wire/tie': 'wire',
  'wire/mesh': 'mesh',
  'steel/billet': 'billet',
  'felezat-rangi/copper-bushing': 'ring',
  'felezat-rangi/ingot': 'ingot',
  'shiralat-sanati/gate': 'valve',
  'etesalat-felezi/elbow': 'elbow',
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
  ['شمش', 'billet'],
  ['زانو', 'elbow'],
  ['شیرآلات', 'valve'],
  ['شیر', 'valve'],
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
 * characters: «مش» is inside «مشکی», so a bare substring test would draw
 * «ورق مشکی» as woven mesh. Multi-part patterns stay substring tests. Words
 * split on anything that is not a letter or digit, plus ZWNJ.
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

/** Rendered stroke per size (px). */
function strokeFor(size: number) {
  const target = size <= 16 ? 1.25 : size <= 20 ? 1.5 : size <= 24 ? 1.75 : 2;
  return (target * 24) / size;
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
  // row under it, so the column never goes ragged.
  if (!glyph) return <CategoryArt slug={categorySlug} size={size} />;

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

  switch (glyph) {
    case 'plate':
      return micro
        ? (<svg {...common}><path d="M3.5 9 12 12.5 20.5 9"/><path d="M3.5 14 12 17.5 20.5 14"/></svg>)
        : (<svg {...common}><path d="M12 4 20.5 7.7 12 11.4 3.5 7.7Z"/><path d="M3.5 7.7V9.6L12 13.3 20.5 9.6V7.7"/><path d="M3.5 12.4V14.3L12 18 20.5 14.3V12.4"/></svg>);
    case 'plateCoated':
      return micro
        ? (<svg {...common}><path d="M12 8.5 20.5 12 12 15.5 3.5 12Z"/><path d="M6.5 9.5 12 7l5.5 2.5" strokeDasharray="2 2"/></svg>)
        : (<svg {...common}><path d="M12 7 20.5 10.7 12 14.4 3.5 10.7Z"/><path d="M3.5 10.7V12.6L12 16.3 20.5 12.6V10.7"/><path d="M6 8.7 12 6l6 2.7" strokeDasharray="2.2 2"/></svg>);
    case 'checkered':
      return micro
        ? (<svg {...common}><path d="M12 8.5 20.5 12 12 15.5 3.5 12Z"/><path d="M9.6 11 11.2 12.4M13 9.8 14.6 11.2"/></svg>)
        : (<svg {...common}><path d="M12 7.5 20.5 11.2 12 14.9 3.5 11.2Z"/><path d="M3.5 11.2V13.1L12 16.8 20.5 13.1V11.2"/><path d="M9 10 10.6 11.4M12.6 8.8 14.2 10.2M9.6 12.6 11.2 14"/></svg>);
    case 'corrugated':
      return micro
        ? (<svg {...common}><path d="M3 15.5l3.5-6 3.5 6 3.5-6 3.5 6 3.5-6"/></svg>)
        : (<svg {...common}><path d="M2.5 13.8l3.2-4.2 3.2 4.2 3.2-4.2 3.2 4.2 3.2-4.2 3.4 4.2"/><path d="M2.5 18l3.2-4.2 3.2 4.2 3.2-4.2 3.2 4.2 3.2-4.2 3.4 4.2"/><path d="M2.5 13.8V18M21.9 18V13.8"/></svg>);
    case 'panel':
      return micro
        ? (<svg {...common}><path d="M3 7H21M3 17H21"/><path d="M6 15 10 9 14 15 18 9"/></svg>)
        : (<svg {...common}><path d="M3 6.5H21M3 17.5H21"/><path d="M4.8 14.8 8.4 9.2 12 14.8 15.6 9.2 19.2 14.8"/></svg>);
    case 'deck':
      return micro
        ? (<svg {...common}><path d="M3 16H6.5L9 9H13L15.5 16H19"/></svg>)
        : (<svg {...common}><path d="M2.5 16.5H6L8.5 8.5H12.5L15 16.5H18.5L21 8.5"/></svg>);
    case 'strip':
      return micro
        ? (<svg {...common}><rect x="2.5" y="9.8" width="19" height="4.4" rx="1.5"/></svg>)
        : (<svg {...common}><rect x="2.5" y="9.5" width="19" height="5" rx="1.5"/></svg>);
    case 'grating':
      return micro
        ? (<svg {...common}><path d="M3.5 6H20.5V18H3.5Z"/><path d="M12 6V18M3.5 12H20.5"/></svg>)
        : (<svg {...common}><path d="M3.5 5.5H20.5V18.5H3.5Z"/><path d="M9 5.5V18.5M15 5.5V18.5M3.5 12H20.5"/></svg>);
    case 'perforated':
      return micro
        ? (<svg {...common}><path d="M3.5 6H20.5V18H3.5Z"/><path d="M9.5 10h.01M14.5 10h.01M9.5 14h.01M14.5 14h.01"/></svg>)
        : (<svg {...common}><path d="M3.5 5.5H20.5V18.5H3.5Z"/><path d="M8.5 9.5h.01M12 9.5h.01M15.5 9.5h.01M8.5 14.5h.01M12 14.5h.01M15.5 14.5h.01"/></svg>);
    case 'pipe':
      return micro
        ? (<svg {...common}><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/></svg>)
        : (<svg {...common}><ellipse cx="7.5" cy="12" rx="3.2" ry="7"/><ellipse cx="7.5" cy="12" rx="1.5" ry="3.4"/><path d="M7.5 5H16.5a3.2 7 0 0 1 0 14H7.5"/></svg>);
    case 'pipeSpiral':
      return micro
        ? (<svg {...common}><rect x="2.5" y="7.4" width="19" height="9.2" rx="4.6"/><path d="M10 7.6 13.4 16.4"/></svg>)
        : (<svg {...common}><rect x="2.5" y="7" width="19" height="10" rx="5"/><path d="M8 7.4 11.6 16.6M14 7.4 17.6 16.6"/></svg>);
    case 'box':
      return micro
        ? (<svg {...common}><path d="M4 4H20V20H4Z"/><path d="M9 9H15V15H9Z"/></svg>)
        : (<svg {...common}><path d="M4 4H20V20H4Z"/><path d="M8.5 8.5H15.5V15.5H8.5Z"/></svg>);
    case 'squareBar':
      return micro
        ? (<svg {...common}><path d="M4.5 4.5H19.5V19.5H4.5Z"/><path d="M9 15.5 15.5 9"/></svg>)
        : (<svg {...common}><path d="M4.5 4.5H19.5V19.5H4.5Z"/><path d="M8 16 16 8M12 17.5 17.5 12"/></svg>);
    case 'zprofile':
      return micro
        ? (<svg {...common}><path d="M19 4.5H12.5V19.5H5"/></svg>)
        : (<svg {...common}><path d="M19.5 4H12.5V20H4.5"/></svg>);
    case 'angle':
      return micro
        ? (<svg {...common}><path d="M6 4V18H20"/></svg>)
        : (<svg {...common}><path d="M4.5 4H8V16.5H20V20H4.5Z"/></svg>);
    case 'channel':
      return micro
        ? (<svg {...common}><path d="M6 4V18H18V4"/></svg>)
        : (<svg {...common}><path d="M4 4H7.5V16.5H16.5V4H20V20H4Z"/></svg>);
    case 'tee':
      return micro
        ? (<svg {...common}><path d="M4 6H20M12 6V20"/></svg>)
        : (<svg {...common}><path d="M4 4H20V7.5H13.75V20H10.25V7.5H4Z"/></svg>);
    case 'beam':
      return micro
        ? (<svg {...common}><path d="M8 4H16M8 20H16M12 4V20"/></svg>)
        : (<svg {...common}><path d="M7.5 3H16.5V6.2H13.6V17.8H16.5V21H7.5V17.8H10.4V6.2H7.5Z"/></svg>);
    case 'beamH':
      return micro
        ? (<svg {...common}><path d="M3 7H21M3 17H21M12 7V17"/></svg>)
        : (<svg {...common}><path d="M2.5 5.5H21.5V9.3H14.6V14.7H21.5V18.5H2.5V14.7H9.4V9.3H2.5Z"/></svg>);
    case 'castellated':
      return micro
        ? (<svg {...common}><path d="M3 5H21M3 19H21"/><path d="M12 9.3 14.7 10.65V13.35L12 14.7 9.3 13.35V10.65Z"/></svg>)
        : (<svg {...common}><path d="M3 4H21V7H3ZM3 17H21V20H3Z"/><path d="M8.5 9.4 11.1 10.7V13.3L8.5 14.6 5.9 13.3V10.7Z"/><path d="M15.5 9.4 18.1 10.7V13.3L15.5 14.6 12.9 13.3V10.7Z"/></svg>);
    case 'rebar':
      return micro
        ? (<svg {...common}><rect x="2.5" y="8.2" width="19" height="7.6" rx="3.8"/><path d="M10 8.4 8.7 15.6M15.5 8.4 14.2 15.6"/></svg>)
        : (<svg {...common}><rect x="2.5" y="8.5" width="19" height="7" rx="3.5"/><path d="M8.2 8.6 6.9 15.4M12.7 8.6 11.4 15.4M17.2 8.6 15.9 15.4"/></svg>);
    case 'plainBar':
      return micro
        ? (<svg {...common}><rect x="2.5" y="8.2" width="19" height="7.6" rx="3.8"/><path d="M17.4 8.5a3.7 3.5 0 0 1 0 7"/></svg>)
        : (<svg {...common}><rect x="2.5" y="8.5" width="19" height="7" rx="3.5"/><path d="M17.6 8.7a3.5 3.3 0 0 1 0 6.6"/></svg>);
    case 'coupler':
      return micro
        ? (<svg {...common}><path d="M3 12H7M17 12H21"/><rect x="7" y="9" width="10" height="6" rx="1.5"/><path d="M12 9v6"/></svg>)
        : (<svg {...common}><path d="M2.5 12H7M17 12H21.5"/><rect x="7" y="8.5" width="10" height="7" rx="1.5"/><path d="M10.2 8.5v7M13.8 8.5v7"/></svg>);
    case 'coil':
      return micro
        ? (<svg {...common}><path d="M15.9 4.5 12 3.8a8.2 8.2 0 0 1 8.2 8.2 7.7 7.7 0 0 1-8.2 7.7 7.1 7.1 0 0 1-7.1-7.7 6.4 6.4 0 0 1 7.1-6.4 5.6 5.6 0 0 1 5.2 6.4 4.6 4.6 0 0 1-5.2 4.4"/></svg>)
        : (<svg {...common}><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.4"/><path d="M16.3 10.4 18.4 6.7M11.8 7.4 8.9 4.3M7.6 10.7 3.7 12.6M9.4 15.8 10 20M14.8 15.6 19 16.4"/></svg>);
    case 'wire':
      return micro
        ? (<svg {...common}><path d="M3.5 15c3-6.5 5.5 6.5 8.5 0s5.5-6.5 8.5 0"/></svg>)
        : (<svg {...common}><path d="M3 15.5c3-7 6 7 9 0s6-7 9 0"/></svg>);
    case 'mesh':
      return micro
        ? (<svg {...common}><path d="M3.5 9H20.5M3.5 15H20.5M9 4.5V19.5M15 4.5V19.5"/></svg>)
        : (<svg {...common}><path d="M3.5 8H20.5M3.5 12H20.5M3.5 16H20.5M8 4.5V19.5M12 4.5V19.5M16 4.5V19.5"/></svg>);
    case 'flange':
      return micro
        ? (<svg {...common}><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.8"/><path d="M12 5.6h.01M12 18.4h.01"/></svg>)
        : (<svg {...common}><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.6"/><path d="M12 5.4h.01M12 18.6h.01M5.4 12h.01M18.6 12h.01"/></svg>);
    case 'ring':
      return micro
        ? (<svg {...common}><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/></svg>)
        : (<svg {...common}><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5.2"/></svg>);
    case 'spring':
      return micro
        ? (<svg {...common}><path d="M4.5 4.5H19.5M4.5 19.5H19.5"/><path d="M5.5 8.5 18.5 10.5M5.5 13.5 18.5 15.5"/></svg>)
        : (<svg {...common}><path d="M4.5 4H19.5M4.5 20H19.5"/><path d="M5.5 7.4 18.5 9.2M5.5 11.2 18.5 13M5.5 15 18.5 16.8"/></svg>);
    case 'billet':
      return micro
        ? (<svg {...common}><path d="M12 3.5 20 8V16L12 20.5 4 16V8Z"/></svg>)
        : (<svg {...common}><path d="M12 3.5 20 8V16L12 20.5 4 16V8Z"/><path d="M12 8.6 16.4 11.2V15.8L12 18.4 7.6 15.8V11.2Z"/></svg>);
    case 'ingot':
      return micro
        ? (<svg {...common}><path d="M4 20H17L15.4 16H5.6Z"/><path d="M6.6 16H19.6L18 12H8.2Z"/></svg>)
        : (<svg {...common}><path d="M4 20H17L15.4 16H5.6Z"/><path d="M6.6 16H19.6L18 12H8.2Z"/><path d="M9.2 12H17.6L16.4 8.8H10.4Z"/></svg>);
    case 'valve':
      return micro
        ? (<svg {...common}><path d="M4 8 11 12 4 16Z"/><path d="M20 8 13 12 20 16Z"/><path d="M12 12V6.5M9 5h6"/></svg>)
        : (<svg {...common}><path d="M4 8 11 12 4 16Z"/><path d="M20 8 13 12 20 16Z"/><path d="M12 12V6.5"/><path d="M8.5 5h7"/></svg>);
    case 'elbow':
      return micro
        ? (<svg {...common}><path d="M6 20V12A6 6 0 0 1 12 6H20"/></svg>)
        : (<svg {...common}><path d="M5 20V12A7 7 0 0 1 12 5H20V9H12A3 3 0 0 0 9 12V20Z"/></svg>);
  }
}

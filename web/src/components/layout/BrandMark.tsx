import { useId } from 'react';

/**
 * The Ahantime mark — A + I-beam T inside a broken ring — as inline vector
 * (source of truth: public/brand/ahantime-mark.svg, PNG derivatives for
 * favicons/print are rendered from it). Inline because the mark paints in
 * `currentColor`: brand teal on light surfaces, lifted teal in dark theme,
 * white over the hero — one asset, no per-context raster variants. The
 * ring/letter separation gaps are masks (truly transparent), so the mark
 * sits on any background. viewBox 1000×1080 → width ≈ 0.926 × height.
 */
export function BrandMark({ size = 38, className }: { size?: number; className?: string }) {
  const uid = useId();
  const ring = `${uid}-ring`;
  const legsM = `${uid}-legs`;
  const bar = `${uid}-bar`;
  const g = { fill: '#000', stroke: '#000', strokeWidth: 36 } as const;
  return (
    <svg
      width={Math.round(size * (1000 / 1080))}
      height={size}
      viewBox="0 0 1000 1080"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <path id={`${uid}-A`} d="M472,20 L528,20 L872,1042 L752,1042 L500,285 L248,1042 L128,1042 Z" />
        <g id={`${uid}-T`}>
          <path d="M260,585 H740 V660 H260 Z" />
          <circle cx="250" cy="702" r="52" />
          <path d="M260,585 Q216,588 204,650 L260,660 Z" />
          <circle cx="750" cy="702" r="52" />
          <path d="M740,585 Q784,588 796,650 L740,660 Z" />
        </g>
        <path
          id={`${uid}-S`}
          d="M462,655 H538 V920 C538,962 560,978 606,990 L606,1044 H394 L394,990 C440,978 462,962 462,920 Z"
        />
        <mask id={ring}>
          <rect width="1000" height="1080" fill="#fff" />
          <use href={`#${uid}-A`} {...g} />
          <use href={`#${uid}-T`} {...g} />
          <use href={`#${uid}-S`} {...g} />
        </mask>
        <mask id={legsM}>
          <rect width="1000" height="1080" fill="#fff" />
          <use href={`#${uid}-T`} {...g} />
          <use href={`#${uid}-S`} {...g} />
        </mask>
        <mask id={bar}>
          <rect width="1000" height="1080" fill="#fff" />
          <path d="M296,690 A40,40 0 1 1 250,660" fill="none" stroke="#000" strokeWidth="13" />
          <path d="M704,690 A40,40 0 1 0 750,660" fill="none" stroke="#000" strokeWidth="13" />
        </mask>
      </defs>
      <circle cx="500" cy="530" r="405" fill="none" stroke="currentColor" strokeWidth="58" mask={`url(#${ring})`} />
      <use href={`#${uid}-A`} fill="currentColor" mask={`url(#${legsM})`} />
      <use href={`#${uid}-T`} fill="currentColor" mask={`url(#${bar})`} />
      <use href={`#${uid}-S`} fill="currentColor" />
    </svg>
  );
}

import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/** Apple touch icon (iOS "Add to Home Screen") — apple-icon.png must be a
 *  raster format, so this mirrors icon.svg as a generated PNG. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#171C22',
        }}
      >
        <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
          <g fill="#FFFFFF">
            <rect x="36" y="40" width="48" height="11" rx="3" />
            <rect x="54.5" y="48" width="11" height="24" rx="2" />
            <rect x="36" y="69" width="48" height="11" rx="3" />
          </g>
          <path
            d="M89 26c.5 7 2.5 9 9.5 9.5-7 .5-9 2.5-9.5 9.5-.5-7-2.5-9-9.5-9.5 7-.5 9-2.5 9.5-9.5Z"
            fill="#F5961E"
          />
        </svg>
      </div>
    ),
    { ...size },
  );
}

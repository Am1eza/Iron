import { ImageResponse } from 'next/og';

export const alt = 'آهن‌تایم — بازار هوشمند آهن و فولاد';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
// Required for `output: export` (this file's own comment already documents
// export-build compatibility as the intent) — without it, `next build
// EXPORT=1` fails collecting page data for this route (confirmed directly).
export const dynamic = 'force-static';

/**
 * Sitewide default OG/Twitter share card. Rendered once at build time (no
 * per-request params), so this is compatible with both the SSR/Cloudflare
 * deploy and the `output: export` preview build. Latin-only wordmark —
 * satori (the renderer behind next/og) does not shape joined Arabic/Persian
 * script, so Persian text would render as disconnected glyphs.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#171C22',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 28,
          }}
        >
          <svg width="108" height="108" viewBox="0 0 120 120" fill="none">
            <rect width="120" height="120" rx="27" fill="#20262F" />
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
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 76, fontWeight: 700, color: '#FFFFFF', letterSpacing: -1 }}>
              Ahantime
            </div>
            <div style={{ fontSize: 30, color: '#8FAEFF', marginTop: 4 }}>
              Smart Steel &amp; Iron Marketplace
            </div>
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 40,
            fontSize: 26,
            color: '#9AA4B2',
          }}
        >
          Live prices · AI advisor · Guaranteed delivery time
        </div>
      </div>
    ),
    { ...size },
  );
}

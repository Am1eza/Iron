import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
  const logoData = readFileSync(join(process.cwd(), 'public/brand/icon-512.png'));
  const logoSrc = `data:image/png;base64,${logoData.toString('base64')}`;

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
          {/* eslint-disable-next-line @next/next/no-img-element -- satori (next/og) needs a plain <img>, not next/image */}
          <img src={logoSrc} width={108} height={108} alt="" />
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

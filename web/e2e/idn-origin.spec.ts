import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, expect } from '@playwright/test';
import { PANEL_BASE_URL } from '../playwright.config';

/**
 * G-168 (docs/audit-rbac-panel-G.md): the audit's unit-level proof
 * (src/lib/auth/origin.test.ts) showed that the platform's `Headers` API
 * itself throws when handed a raw non-ASCII `Origin` string — a strong
 * result, but still an inference about the Fetch API spec, not a real
 * browser navigated to a real IDN homograph domain. This test closes that
 * specific gap.
 *
 * `xn--hantime-1fg.com` is the REAL IDNA `ToASCII` punycode encoding of
 * `аhantime.com` — spelled with Cyrillic U+0430 (а) instead of Latin `a`, a
 * classic homograph of this app's own domain — verified with Node's `URL`:
 *   > new URL('http://аhantime.com/').hostname
 *   'xn--hantime-1fg.com'
 * playwright.config.ts resolves it to the loopback dev server (alongside the
 * existing panel.ahantime.com mapping) so Chromium can actually navigate
 * there. Spelled here directly in punycode since the browser converts the
 * two forms identically on the wire regardless — that IS the point: whatever
 * a human would see in the address bar, `window.location.origin` and every
 * `Origin` header a page on this host sends are always this ASCII string,
 * never the raw Cyrillic one.
 *
 * The page navigated to here is a tiny THIRD-PARTY-style static server (same
 * technique as e2e/cross-origin-csrf.spec.ts's G-166 test), NOT one of
 * ahantime's own app pages — an earlier draft tried navigating straight to
 * `http://xn--hantime-1fg.com:3100/` (the real Next.js app, since proxy.ts
 * happily serves the public site under any Host that isn't panel.ahantime.com)
 * and the cross-origin fetch never even left the browser: ahantime's own
 * `Content-Security-Policy: connect-src 'self'` blocked it client-side,
 * exactly the same trap G-166's header comment describes. The homograph
 * domain here is standing in for an ATTACKER's page that merely resembles
 * ahantime, so it must not carry ahantime's own defenses.
 */
const IDN_HOST = 'xn--hantime-1fg.com';

test.describe.configure({ timeout: 60_000 });

test('a real browser on an IDN homograph domain only ever computes/sends an ASCII (punycode) origin, and the API rejects it as a mismatch', async ({
  page,
}) => {
  const targetUrl = `${PANEL_BASE_URL}/api/admin/allowlist`;

  const attackerServer = http.createServer((_req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(`<!doctype html>
<html><body>
<div id="result">pending</div>
<script>
(async () => {
  try {
    const res = await fetch(${JSON.stringify(targetUrl)}, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' }, // CORS-safelisted → no preflight
      body: JSON.stringify({ mobile: '09120000099', role: 'admin' }),
    });
    document.getElementById('result').textContent = 'responded:' + res.status;
  } catch (err) {
    document.getElementById('result').textContent = 'blocked:' + err;
  }
})();
</script>
</body></html>`);
  });
  await new Promise<void>((resolve) => attackerServer.listen(0, '127.0.0.1', () => resolve()));
  const attackerPort = (attackerServer.address() as AddressInfo).port;
  // Host resolves to 127.0.0.1 via playwright.config.ts's host-resolver-rules
  // — the port is just whatever this Node http.Server picked, resolution
  // doesn't care about it.
  const idnBaseUrl = `http://${IDN_HOST}:${attackerPort}`;

  try {
    // Attached BEFORE navigating: the served page's inline script fires its
    // fetch immediately on load, and a CDP session created only AFTER
    // `page.goto()` resolves reliably missed it in practice (the fetch had
    // already completed by then) — confirmed empirically while writing this
    // test, the same lesson as e2e/cross-origin-csrf.spec.ts's header
    // comment about attaching CDP listeners early enough to actually see
    // the request they're meant to observe.
    const client = await page.context().newCDPSession(page);
    await client.send('Network.enable');
    let targetRequestId: string | null = null;
    // Keyed by requestId, not by targetRequestId directly: CDP does not
    // guarantee `requestWillBeSentExtraInfo` fires after (rather than
    // before) the plain `requestWillBeSent` for the same request — buffering
    // by id and resolving the match afterward is what makes this robust to
    // either order, confirmed empirically while writing this test.
    const extraHeadersByRequestId = new Map<string, Record<string, string>>();
    client.on('Network.requestWillBeSent', (event) => {
      if (event.request.url === targetUrl) targetRequestId = event.requestId;
    });
    // `Network.requestWillBeSent`'s own `request.headers` is the renderer's
    // pre-network header set and does not reliably include `Origin` (added
    // lower in Chromium's network stack) — `...ExtraInfo` carries the
    // ACTUAL headers sent over the wire, confirmed empirically while writing
    // this test.
    client.on('Network.requestWillBeSentExtraInfo', (event) => {
      extraHeadersByRequestId.set(event.requestId, event.headers as Record<string, string>);
    });
    // Same technique as e2e/cross-origin-csrf.spec.ts (G-166): Chromium
    // fails this cross-origin "simple" request for CORS before its
    // renderer-facing `Network.responseReceived` event ever fires, but
    // `...ExtraInfo` still carries the real response Chromium's network
    // process actually received — status code included.
    const serverResponse = new Promise<{ status: number }>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('no Network.responseReceivedExtraInfo for the target request within 15s')),
        15_000,
      );
      client.on('Network.responseReceivedExtraInfo', (event) => {
        if (event.requestId === targetRequestId && typeof event.statusCode === 'number') {
          clearTimeout(timer);
          resolve({ status: event.statusCode });
        }
      });
    });

    await page.goto(`${idnBaseUrl}/`);

    // The structural claim this test exists to confirm in a REAL browser:
    // the page's own origin — what every same-origin check and every
    // fetch's Origin header is derived from — is the ASCII/punycode string,
    // never a raw non-ASCII byte, even on a domain a human would see
    // rendered with a lookalike Cyrillic letter.
    const browserOrigin = await page.evaluate(() => window.location.origin);
    expect(browserOrigin).toBe(`http://${IDN_HOST}:${attackerPort}`);
    expect(browserOrigin).not.toMatch(/[^\x00-\x7F]/);

    // The page's own inline script already fired its fetch on load — just
    // wait for its result marker.
    await page.waitForFunction(() => document.getElementById('result')?.textContent !== 'pending');
    const clientSideResult = await page.locator('#result').textContent();

    const res = await serverResponse;
    expect(res.status).toBe(403);

    // The actual header byte the server received: ASCII/punycode, never the
    // raw Cyrillic homograph — and it is REJECTED, exactly because it's a
    // different string from the real panel host.
    expect(targetRequestId).not.toBeNull();
    const observedOrigin = extraHeadersByRequestId.get(targetRequestId!)?.Origin ?? extraHeadersByRequestId.get(targetRequestId!)?.origin;
    expect(observedOrigin).toBe(`http://${IDN_HOST}:${attackerPort}`);
    expect(observedOrigin).not.toMatch(/[^\x00-\x7F]/);

    // Real browser CORS enforcement (no Access-Control-Allow-Origin from
    // ahantime) also blocks the page's own script from reading the 403.
    expect(clientSideResult).toMatch(/^blocked:/);
  } finally {
    attackerServer.close();
  }
});

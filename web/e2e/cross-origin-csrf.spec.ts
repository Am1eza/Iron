import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, expect } from '@playwright/test';
import { PANEL_BASE_URL } from '../playwright.config';

/**
 * G-166 (docs/audit-rbac-panel-G.md): a genuine cross-origin browser request
 * from a THIRD-PARTY page, not a hand-built `NextRequest` with a manually-set
 * `Origin` header (see src/lib/auth/origin.test.ts for that unit-level
 * coverage) and not a fetch launched from one of ahantime's OWN pages
 * either — an earlier version of this test tried that and the request never
 * even left the browser: ahantime's own `Content-Security-Policy:
 * connect-src 'self'` (next.config.mjs) blocked it client-side before the
 * server ever got a chance to reject it. That's a real defense, but it only
 * protects ahantime's own pages against exfiltrating FROM themselves — a
 * genuine CSRF attacker's page has no such CSP and is under no obligation to
 * carry one, so testing "from an ahantime page" would have proven the wrong
 * thing. This test instead spins up a tiny plain HTTP server (a real
 * separate origin: same loopback IP, different port, zero relation to this
 * app, no CSP header at all) to stand in for an attacker's page, exactly as
 * the audit asked for ("یک درخواست cross-origin از یک صفحهٔ سوم").
 *
 * No login anywhere here: `requireApiUser` (src/lib/server/utils/apiGuard.ts)
 * calls `assertSameOrigin()` before it ever reads the session cookie, so an
 * UNAUTHENTICATED cross-origin POST is already rejected by the origin guard
 * — proving this CSRF defense fires ahead of, and independent of,
 * authentication.
 */
test.describe.configure({ timeout: 60_000 });

test('a real cross-origin browser fetch, from a genuine third-party page, is rejected by the admin write endpoint', async ({
  page,
}) => {
  const targetUrl = `${PANEL_BASE_URL}/api/admin/allowlist`;

  // The "attacker's page": plain HTTP, no ahantime code, no CSP header —
  // just a script that fetches the real target URL and reports what it saw.
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
      // text/plain is one of the three CORS-safelisted content-types —
      // keeping this a "simple request" (no preflight OPTIONS) means the
      // ACTUAL POST reaches the server, so the test can assert on its real
      // response rather than on whether a preflight merely happened.
      headers: { 'content-type': 'text/plain' },
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

  try {
    // Chromium's own CORS handling for a cross-origin "simple" request with
    // no matching Access-Control-Allow-Origin reports it to Playwright's
    // page-level `response`/`requestfailed` events as a plain
    // `net::ERR_FAILED` — confirmed empirically while writing this test —
    // which loses the actual status code, and the CDP `Network.responseReceived`
    // event never fires either (Chromium fails the request for CORS before
    // reaching that stage). `Network.responseReceivedExtraInfo` DOES fire
    // with the real response's status code regardless: the HTTP response
    // genuinely arrived over the wire, and CORS is what stops the PAGE's
    // script from reading it, not the browser process from receiving it.
    // Going one level below Playwright's page API here is what makes this a
    // proof about the real response, not merely about whether some request
    // or other got sent.
    const client = await page.context().newCDPSession(page);
    await client.send('Network.enable');
    let targetRequestId: string | null = null;
    client.on('Network.requestWillBeSent', (event) => {
      if (event.request.url === targetUrl) targetRequestId = event.requestId;
    });
    const serverResponse = new Promise<{ status: number }>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('no Network.responseReceivedExtraInfo for the target request within 15s')),
        15_000,
      );
      // The renderer-facing `Network.responseReceived` never fires for this
      // request (Chromium fails it for CORS before that stage — see
      // `Network.loadingFailed`'s `corsErrorStatus.corsError:
      // 'MissingAllowOriginHeader'`), but `...ExtraInfo` carries the REAL
      // response Chromium's network process actually received on the wire,
      // status code included, regardless of what the renderer/script gets
      // to see. That's the proof this test needs: the server really was
      // asked, and it really answered 403 — not merely "some request or
      // other got blocked before reaching the network at all".
      client.on('Network.responseReceivedExtraInfo', (event) => {
        if (event.requestId === targetRequestId && typeof event.statusCode === 'number') {
          clearTimeout(timer);
          resolve({ status: event.statusCode });
        }
      });
    });

    await page.goto(`http://127.0.0.1:${attackerPort}/`);
    await page.waitForFunction(() => document.getElementById('result')?.textContent !== 'pending');
    const clientSideResult = await page.locator('#result').textContent();

    const res = await serverResponse;
    expect(res.status).toBe(403);

    // The attacker page's own script never got a usable response — real
    // browser CORS enforcement (no Access-Control-Allow-Origin from
    // ahantime) blocks it from reading even the 403 status/body, which is
    // exactly the browser-native protection layered on top of the server's
    // own origin check.
    expect(clientSideResult).toMatch(/^blocked:/);
  } finally {
    attackerServer.close();
  }
});

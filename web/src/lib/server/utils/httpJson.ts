/**
 * Minimal JSON-over-HTTP client for outbound integrations, shared by
 * `integrations/tgju.ts` and `integrations/esfahanahan.ts`.
 *
 * Deliberately `node:http(s)` rather than `fetch()`: Node's `fetch()`
 * resolves hostnames via the OS's `getaddrinfo()` and on this image's
 * Alpine/musl base that call is unreliable for some external domains
 * (confirmed: consistently ENOTFOUND for gold-api.com while `dns.resolve4()`,
 * which talks to the nameserver directly instead of going through musl,
 * resolves it instantly). `http(s).get`'s `lookup` option lets us swap in
 * `dns.resolve4` for just these calls, sidestepping the musl bug entirely
 * rather than chasing it via resolver/DNS-server config — Docker-internal
 * hostnames (the `tgju` service) are unaffected either way, they resolve
 * through the embedded 127.0.0.11 resolver, a different path.
 *
 * This lived inline in `tgju.ts` until the billet source (esfahanahan.com)
 * needed the identical treatment; it is the same code, moved, not new.
 */
import * as dns from 'node:dns';
import * as http from 'node:http';
import * as https from 'node:https';

/** HTTP errors thrown internally, tagged with a status so the resilience
 *  layer can tell a transient 5xx/network blip (worth retrying) from a
 *  persistent 4xx (retrying won't fix a bad URL). */
export class UpstreamHttpError extends Error {
  constructor(public status: number) {
    super(`upstream HTTP ${status}`);
  }
}

export function isRetryableHttpError(err: unknown): boolean {
  if (err instanceof UpstreamHttpError) return err.status >= 500;
  return true; // network errors, timeouts, DNS failures, etc.
}

function resolveLookup(
  hostname: string,
  options: dns.LookupOptions,
  cb: (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void,
): void {
  dns.resolve4(hostname, (err, addresses) => {
    if (err) return cb(err, '');
    if (options.all) cb(null, addresses.map((address) => ({ address, family: 4 })));
    else cb(null, addresses[0]!, 4);
  });
}

export function fetchJson(url: string, timeoutMs = 5000, headers?: Record<string, string>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;
    const req = client.get(url, { timeout: timeoutMs, lookup: resolveLookup, headers }, (res) => {
      const status = res.statusCode ?? 0;
      if (status < 200 || status >= 300) {
        res.resume(); // drain so the socket can be released back to the pool
        reject(new UpstreamHttpError(status));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('request timed out')));
    req.on('error', reject);
  });
}

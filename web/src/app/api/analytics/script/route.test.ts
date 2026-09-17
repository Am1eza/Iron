import { describe, it, expect } from 'vitest';
import { GET } from './route';

/** The Matomo bootstrap is served to visitors only — panel.ahantime.com is
 *  the same container and its staff sessions were landing in the customer
 *  analytics (the GA4 half of this lives in components/analytics). */
describe('GET /api/analytics/script', () => {
  const call = (host: string) => GET(new Request('https://x/api/analytics/script', { headers: { host } }));

  it('serves nothing on the panel host', async () => {
    const body = await (await call('panel.ahantime.com')).text();
    expect(body).not.toContain('matomo.js');
    expect(body).toContain('disabled');
  });

  it('still answers on the public host', async () => {
    const res = await call('ahantime.com');
    expect(res.headers.get('content-type')).toContain('javascript');
    // With MATOMO_SITE_ID unset in tests this is the documented empty file;
    // either way it must not be the panel branch.
    expect(await res.text()).not.toContain('panel host');
  });
});

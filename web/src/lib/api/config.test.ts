import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function modeFor(nodeEnv: string, configured?: string, exporting?: string) {
  vi.stubEnv('NODE_ENV', nodeEnv);
  vi.stubEnv('NEXT_PUBLIC_API_MODE', configured ?? '');
  vi.stubEnv('EXPORT', exporting ?? '');
  vi.resetModules();
  return (await import('./config')).API_MODE;
}

describe('public API mode safety', () => {
  it('defaults to live in production, so an omitted variable cannot publish fixtures', async () => {
    await expect(modeFor('production')).resolves.toBe('live');
  });

  it('ignores an accidental production mock value unless this is an explicit static preview', async () => {
    await expect(modeFor('production', 'mock')).resolves.toBe('live');
    await expect(modeFor('production', 'mock', '1')).resolves.toBe('mock');
  });

  it('keeps mock as the convenient non-production default', async () => {
    await expect(modeFor('development')).resolves.toBe('mock');
  });
});

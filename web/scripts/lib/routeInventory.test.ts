import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import { buildRouteInventory } from './routeInventory';

const tmpDirs: string[] = [];

function fixture(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'route-inventory-test-'));
  tmpDirs.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

afterEach(() => {
  while (tmpDirs.length) fs.rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

describe('buildRouteInventory', () => {
  it('flags an admin route with no auth guard call', () => {
    const dir = fixture({
      'admin/foo/route.ts': `export const GET = async (req) => Response.json({});`,
    });
    const [route] = buildRouteInventory(dir);
    expect(route?.family).toBe('admin');
    expect(route?.hasAuthGuard).toBe(false);
  });

  it('detects an auth guard call regardless of which of the three it is', () => {
    const dir = fixture({
      'admin/a/route.ts': `async function GET(req) { await requireApiPermission(req, 'x'); }`,
      'admin/b/route.ts': `async function GET(req) { await requireApiUser(req); }`,
      'admin/c/route.ts': `async function GET(req) { await getSessionVerified(); }`,
    });
    const routes = buildRouteInventory(dir);
    expect(routes.every((r) => r.hasAuthGuard)).toBe(true);
  });

  it('classifies family by the first path segment', () => {
    const dir = fixture({
      'admin/x/route.ts': '',
      'me/y/route.ts': '',
      'internal/z/route.ts': '',
      'search/route.ts': '',
    });
    const routes = buildRouteInventory(dir);
    const byPath = Object.fromEntries(routes.map((r) => [r.relPath, r.family]));
    expect(byPath['admin/x/route.ts']).toBe('admin');
    expect(byPath['me/y/route.ts']).toBe('me');
    expect(byPath['internal/z/route.ts']).toBe('internal');
    expect(byPath['search/route.ts']).toBe('other');
  });

  it('detects POST/PUT/PATCH/DELETE exports and validateBody/rateLimit calls', () => {
    const dir = fixture({
      'leads/route.ts': `
        export async function POST(req) {
          const limited = await rateLimit(req, 'leads', {});
          const v = await validateBody(req, schema);
        }
      `,
    });
    const [route] = buildRouteInventory(dir);
    expect(route?.methods).toContain('POST');
    expect(route?.hasRateLimit).toBe(true);
    expect(route?.hasValidateBody).toBe(true);
  });

  it('does not confuse a GET-only route for a body-accepting one', () => {
    const dir = fixture({ 'x/route.ts': `export const GET = async () => {};` });
    const [route] = buildRouteInventory(dir);
    expect(route?.methods).toEqual(['GET']);
  });
});

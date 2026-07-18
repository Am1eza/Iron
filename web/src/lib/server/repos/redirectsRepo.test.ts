// @vitest-environment node
/** URL redirect management (US-14.3) — path normalization + loop guard. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ulid } from 'ulid';
import { createTestDb } from '@/test/db';
import type { Db } from '@/lib/server/db/client';
import {
  normalizePath,
  findRedirect,
  createRedirect,
  updateRedirect,
  deleteRedirect,
  adminListRedirects,
  RedirectLoopError,
} from './redirectsRepo';

let close: () => Promise<void>;

beforeAll(async () => {
  ({ close } = (await createTestDb()) as { db: Db; close: () => Promise<void> });
}, 120_000);
afterAll(async () => {
  await close();
});

describe('normalizePath', () => {
  it('adds a leading slash, strips a trailing slash and any query/hash', () => {
    expect(normalizePath('foo')).toBe('/foo');
    expect(normalizePath('/foo/')).toBe('/foo');
    expect(normalizePath('/foo?x=1')).toBe('/foo');
    expect(normalizePath('/foo#section')).toBe('/foo');
  });

  it('leaves the root path exactly "/"', () => {
    expect(normalizePath('/')).toBe('/');
  });
});

describe('createRedirect / findRedirect', () => {
  it('creates a redirect and finds it by an unnormalized lookup path', async () => {
    const from = `/old-${ulid()}`;
    const to = `/new-${ulid()}`;
    await createRedirect({ fromPath: from, toPath: to });

    const found = await findRedirect(`${from}/`); // trailing slash — should still match
    expect(found).toMatchObject({ toPath: to, permanent: true });
  });

  it('defaults to permanent:true when not specified, honors permanent:false', async () => {
    const from = `/temp-${ulid()}`;
    const to = `/temp-dest-${ulid()}`;
    await createRedirect({ fromPath: from, toPath: to, permanent: false });
    const found = await findRedirect(from);
    expect(found?.permanent).toBe(false);
  });

  it('returns null for a path with no configured redirect', async () => {
    await expect(findRedirect(`/nope-${ulid()}`)).resolves.toBeNull();
  });

  it('rejects a redirect whose destination is its own source', async () => {
    const path = `/self-${ulid()}`;
    await expect(createRedirect({ fromPath: path, toPath: path })).rejects.toBeInstanceOf(RedirectLoopError);
  });

  it('rejects the immediate 2-hop loop (A→B when B→A already exists)', async () => {
    const a = `/loop-a-${ulid()}`;
    const b = `/loop-b-${ulid()}`;
    await createRedirect({ fromPath: b, toPath: a });
    await expect(createRedirect({ fromPath: a, toPath: b })).rejects.toBeInstanceOf(RedirectLoopError);
  });
});

describe('updateRedirect / deleteRedirect', () => {
  it('updates the destination and permanent flag independently', async () => {
    const from = `/upd-${ulid()}`;
    const created = await createRedirect({ fromPath: from, toPath: '/v1' });

    const patched = await updateRedirect(created.id, { toPath: '/v2' });
    expect(patched).toMatchObject({ toPath: '/v2', permanent: true });

    const patched2 = await updateRedirect(created.id, { permanent: false });
    expect(patched2).toMatchObject({ toPath: '/v2', permanent: false });
  });

  it('returns null when updating a non-existent redirect', async () => {
    await expect(updateRedirect(ulid(), { toPath: '/x' })).resolves.toBeNull();
  });

  it('deleteRedirect removes it — findRedirect no longer matches', async () => {
    const from = `/del-${ulid()}`;
    const created = await createRedirect({ fromPath: from, toPath: '/gone' });
    await deleteRedirect(created.id);
    await expect(findRedirect(from)).resolves.toBeNull();
  });
});

describe('adminListRedirects', () => {
  it('includes a newly created redirect', async () => {
    const from = `/list-${ulid()}`;
    await createRedirect({ fromPath: from, toPath: '/dest' });
    const all = await adminListRedirects();
    expect(all.some((r) => r.fromPath === from)).toBe(true);
  });
});

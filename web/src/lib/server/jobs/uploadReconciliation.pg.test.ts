// @vitest-environment node
/**
 * I-212 — the periodic reconciliation job is the safety net behind the
 * per-route synchronous cleanup (see uploadCleanup.pg.test.ts and the
 * SKU/category route tests): it must remove a truly orphaned file once it's
 * safely past the grace window, but must NEVER remove one that's either
 * still referenced by a live row or too young to be sure it isn't an
 * in-flight upload whose owning row hasn't been saved yet.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { ulid } from 'ulid';
import { createTestDb } from '@/test/db';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import { reconcileOrphanUploads } from './cleanup.job';

let db: Db;
let close: () => Promise<void>;
let tmpDir: string;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ahantime-orphan-reconcile-'));
  process.env.UPLOAD_DIR = path.relative(process.cwd(), tmpDir);
});
afterEach(async () => {
  delete process.env.UPLOAD_DIR;
  await fs.rm(tmpDir, { recursive: true, force: true });
  await close();
});

async function writeUpload(ageMs: number): Promise<string> {
  const filename = `${ulid(Date.now() - ageMs)}.jpg`;
  await fs.writeFile(path.join(tmpDir, filename), Buffer.from([0xff, 0xd8, 0xff]));
  return filename;
}

const HOUR = 60 * 60 * 1000;

describe('reconcileOrphanUploads', () => {
  it('removes an orphan file older than the 48h grace window', async () => {
    const old = await writeUpload(49 * HOUR);
    const result = await reconcileOrphanUploads();
    expect(result.removed).toBe(1);
    expect(await fs.readdir(tmpDir)).not.toContain(old);
  });

  it('leaves an orphan file younger than the grace window alone (may be an in-flight upload)', async () => {
    const young = await writeUpload(1 * HOUR);
    const result = await reconcileOrphanUploads();
    expect(result.removed).toBe(0);
    expect(await fs.readdir(tmpDir)).toContain(young);
  });

  it('never removes a file a live row references, no matter how old', async () => {
    const referenced = await writeUpload(72 * HOUR);
    await db.insert(schema.categories).values({ id: 'c1', slug: 'c1', name: 'میلگرد', imageUrl: `/uploads/${referenced}` });

    const result = await reconcileOrphanUploads();
    expect(result.removed).toBe(0);
    expect(await fs.readdir(tmpDir)).toContain(referenced);
  });

  it('ignores anything in the upload directory that is not shaped like a real upload filename', async () => {
    await fs.writeFile(path.join(tmpDir, '.gitkeep'), '');
    await fs.writeFile(path.join(tmpDir, 'README.md'), '# not an upload');
    const result = await reconcileOrphanUploads();
    expect(result.scanned).toBe(0);
    expect(result.removed).toBe(0);
    expect(await fs.readdir(tmpDir)).toEqual(expect.arrayContaining(['.gitkeep', 'README.md']));
  });

  it('a mixed directory: removes only the old, unreferenced file', async () => {
    const oldOrphan = await writeUpload(50 * HOUR);
    const youngOrphan = await writeUpload(2 * HOUR);
    const oldReferenced = await writeUpload(50 * HOUR);
    await db.insert(schema.categories).values({ id: 'c1', slug: 'c1', name: 'میلگرد', imageUrl: `/uploads/${oldReferenced}` });

    const result = await reconcileOrphanUploads();
    expect(result.scanned).toBe(3);
    expect(result.removed).toBe(1);
    const remaining = await fs.readdir(tmpDir);
    expect(remaining).not.toContain(oldOrphan);
    expect(remaining).toContain(youngOrphan);
    expect(remaining).toContain(oldReferenced);
  });
});

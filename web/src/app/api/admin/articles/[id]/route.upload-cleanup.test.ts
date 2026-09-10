// @vitest-environment node
/**
 * I-212 — deleting a draft article, or replacing its cover image via PATCH,
 * must remove the now-unreferenced cover file from disk (best-effort, never
 * blocking the write itself). Also proves the safety check: a cover image
 * still embedded in the article's own BODY (or any other live reference)
 * must survive.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/utils/apiGuard', () => ({
  requireDb: () => null,
  requireApiPermission: async () => ({ session: { id: 'editor-1', role: 'content' } }),
  audit: async () => {},
  withApiErrorHandling: (handler: unknown) => handler,
}));

let tmpDir: string;
beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ahantime-article-upload-cleanup-'));
  process.env.UPLOAD_DIR = path.relative(process.cwd(), tmpDir);
});
afterAll(async () => {
  delete process.env.UPLOAD_DIR;
  await fs.rm(tmpDir, { recursive: true, force: true });
});
afterEach(async () => {
  for (const f of await fs.readdir(tmpDir)) await fs.rm(path.join(tmpDir, f));
});

async function writeFixture(filename: string): Promise<void> {
  await fs.writeFile(path.join(tmpDir, filename), Buffer.from([0xff, 0xd8, 0xff]));
}

const COVER_A = '01H20000000000000000000001.jpg';
const COVER_B = '01H20000000000000000000002.jpg';

import { PATCH, DELETE } from './route';

function patchReq(id: string, body: unknown) {
  return new NextRequest(`http://localhost/api/admin/articles/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
function deleteReq(id: string) {
  return new NextRequest(`http://localhost/api/admin/articles/${id}`, { method: 'DELETE' });
}

describe('Article delete/replace — orphan cover-image cleanup (I-212)', () => {
  it('deleting a draft article deletes its cover image from disk', async () => {
    const { createTestDb } = await import('@/test/db');
    const schema = await import('@/lib/server/db/schema');
    const { db, close } = await createTestDb();
    try {
      await writeFixture(COVER_A);
      await db.insert(schema.articles).values({
        id: 'a1', slug: 'a1', type: 'blog', title: 'مقاله', bodyMd: '', status: 'draft',
        coverUrl: `/uploads/${COVER_A}`,
      });

      const res = await DELETE(deleteReq('a1'), { params: Promise.resolve({ id: 'a1' }) });
      expect(res.status).toBe(200);
      expect(await fs.readdir(tmpDir)).not.toContain(COVER_A);
    } finally {
      await close();
    }
  });

  it('replacing a cover image via PATCH deletes the old one', async () => {
    const { createTestDb } = await import('@/test/db');
    const schema = await import('@/lib/server/db/schema');
    const { db, close } = await createTestDb();
    try {
      await writeFixture(COVER_A);
      await db.insert(schema.articles).values({
        id: 'a1', slug: 'a1', type: 'blog', title: 'مقاله', bodyMd: '', status: 'draft',
        coverUrl: `/uploads/${COVER_A}`,
      });

      const res = await PATCH(patchReq('a1', { coverUrl: `/uploads/${COVER_B}` }), {
        params: Promise.resolve({ id: 'a1' }),
      });
      expect(res.status).toBe(200);
      expect(await fs.readdir(tmpDir)).not.toContain(COVER_A);
    } finally {
      await close();
    }
  });

  it('deleting a draft article does NOT delete its cover file if a DIFFERENT live article still embeds that same file in its body', async () => {
    const { createTestDb } = await import('@/test/db');
    const schema = await import('@/lib/server/db/schema');
    const { db, close } = await createTestDb();
    try {
      await writeFixture(COVER_A);
      await db.insert(schema.articles).values([
        {
          id: 'a1', slug: 'a1', type: 'blog', title: 'مقاله ۱', bodyMd: '', status: 'draft',
          coverUrl: `/uploads/${COVER_A}`,
        },
        {
          // A second, unrelated, still-live article that happens to embed
          // the exact same uploaded file inline in its own body.
          id: 'a2', slug: 'a2', type: 'blog', title: 'مقاله ۲', bodyMd: '', status: 'draft',
          bodyJson: {
            type: 'doc',
            content: [{ type: 'image', attrs: { src: `/uploads/${COVER_A}`, alt: '' } }],
          } as never,
        },
      ]);

      const res = await DELETE(deleteReq('a1'), { params: Promise.resolve({ id: 'a1' }) });
      expect(res.status).toBe(200);
      // a2 still needs this file — must survive.
      expect(await fs.readdir(tmpDir)).toContain(COVER_A);
    } finally {
      await close();
    }
  });
});

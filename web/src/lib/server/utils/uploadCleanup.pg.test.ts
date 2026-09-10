// @vitest-environment node
/**
 * I-212 — `referencedUploadFilenames()` is the "still in use" side of the
 * orphan-cleanup job, and it MUST be a true superset of every real
 * reference or the reconciliation job (cleanup.job.ts) deletes a file a
 * customer can still see. This is the part of the audit's own finding that
 * is easy to under-cover: `coverUrl`/`imageUrl` alone miss `seo.ogImage`
 * (an independent field an admin can point at a DIFFERENT upload) and, most
 * importantly, images the rich-text editor lets a writer paste directly
 * into an article's BODY (`bodyJson`), nowhere near `coverUrl` at all.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb } from '@/test/db';
import * as schema from '@/lib/server/db/schema';
import type { Db } from '@/lib/server/db/client';
import { joinClub, setLetterhead } from '@/lib/server/repos/clubRepo';
import { referencedUploadFilenames, deleteOrphanedUploadsIfUnused } from './uploadCleanup';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

let db: Db;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
});
afterEach(async () => {
  await close();
});

const IMG_CATEGORY = '01H00000000000000000000001.jpg';
const IMG_CATEGORY_OG = '01H00000000000000000000002.jpg';
const IMG_SKU = '01H00000000000000000000003.jpg';
const IMG_ARTICLE_COVER = '01H00000000000000000000004.jpg';
const IMG_ARTICLE_OG = '01H00000000000000000000005.jpg';
const IMG_ARTICLE_BODY = '01H00000000000000000000006.jpg';
const IMG_LOGO = '01H00000000000000000000007.jpg';
const IMG_ORPHAN = '01H00000000000000000000008.jpg';

describe('referencedUploadFilenames', () => {
  it('collects imageUrl/coverUrl, seo.ogImage (independent field), inline article-body images, and the letterhead logo — but not a truly unreferenced file', async () => {
    await db.insert(schema.categories).values({
      id: 'c1',
      slug: 'c1',
      name: 'میلگرد',
      imageUrl: `/uploads/${IMG_CATEGORY}`,
      seo: { ogImage: `/uploads/${IMG_CATEGORY_OG}` },
    });
    await db.insert(schema.subCategories).values({ id: 's1', categoryId: 'c1', slug: 's1', name: 'آجدار' });
    await db.insert(schema.skus).values({
      id: 'k1',
      slug: 'k1',
      name: 'کالا ۱',
      categoryId: 'c1',
      subCategoryId: 's1',
      unit: 'kg',
      imageUrl: `/uploads/${IMG_SKU}`,
    });
    await db.insert(schema.articles).values({
      id: 'a1',
      slug: 'a1',
      type: 'blog',
      title: 'مقاله',
      bodyMd: '',
      coverUrl: `/uploads/${IMG_ARTICLE_COVER}`,
      seo: { ogImage: `/uploads/${IMG_ARTICLE_OG}` },
      bodyJson: {
        type: 'doc',
        content: [
          {
            type: 'image',
            attrs: { src: `/uploads/${IMG_ARTICLE_BODY}`, alt: '' },
          },
        ],
      } as never,
    });
    await db.insert(schema.users).values({ id: 'u1', mobile: '09120000009', role: 'customer', isActive: true });
    await joinClub('u1');
    await setLetterhead('u1', { logoUrl: `/uploads/${IMG_LOGO}` });

    const refs = await referencedUploadFilenames();
    expect(refs.has(IMG_CATEGORY)).toBe(true);
    expect(refs.has(IMG_CATEGORY_OG)).toBe(true);
    expect(refs.has(IMG_SKU)).toBe(true);
    expect(refs.has(IMG_ARTICLE_COVER)).toBe(true);
    expect(refs.has(IMG_ARTICLE_OG)).toBe(true);
    expect(refs.has(IMG_ARTICLE_BODY)).toBe(true);
    expect(refs.has(IMG_LOGO)).toBe(true);
    expect(refs.has(IMG_ORPHAN)).toBe(false);
  });
});

describe('deleteOrphanedUploadsIfUnused', () => {
  let tmpDir: string;
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ahantime-upload-cleanup-'));
    process.env.UPLOAD_DIR = path.relative(process.cwd(), tmpDir);
  });
  afterEach(async () => {
    delete process.env.UPLOAD_DIR;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('deletes a file referenced by nothing, and spares one an article body still embeds', async () => {
    await fs.writeFile(path.join(tmpDir, IMG_ORPHAN), Buffer.from([0xff, 0xd8, 0xff]));
    await fs.writeFile(path.join(tmpDir, IMG_ARTICLE_BODY), Buffer.from([0xff, 0xd8, 0xff]));
    await db.insert(schema.articles).values({
      id: 'a1',
      slug: 'a1',
      type: 'blog',
      title: 'مقاله',
      bodyMd: '',
      bodyJson: {
        type: 'doc',
        content: [{ type: 'image', attrs: { src: `/uploads/${IMG_ARTICLE_BODY}`, alt: '' } }],
      } as never,
    });

    await deleteOrphanedUploadsIfUnused([`/uploads/${IMG_ORPHAN}`, `/uploads/${IMG_ARTICLE_BODY}`]);

    const remaining = await fs.readdir(tmpDir);
    expect(remaining).not.toContain(IMG_ORPHAN);
    expect(remaining).toContain(IMG_ARTICLE_BODY);
  });

  it('is a no-op for a URL not shaped like an upload path (never touches anything outside uploadDir)', async () => {
    await deleteOrphanedUploadsIfUnused(['https://evil.example/x', '/etc/passwd', null, undefined, '']);
    // No throw, and the temp dir stays exactly as it was (empty).
    expect(await fs.readdir(tmpDir)).toHaveLength(0);
  });
});

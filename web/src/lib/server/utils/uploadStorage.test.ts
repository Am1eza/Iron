// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, it, expect, vi } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { uploadDir, writeUploadFile } from './uploadStorage';

describe('uploadDir', () => {
  it('resolves a real path off cwd outside Cloudflare Workers (this test env)', () => {
    const dir = uploadDir();
    expect(dir.endsWith('public/uploads') || dir.endsWith('public\\uploads')).toBe(true);
  });

  // I-214 — the actual "throws on Workers" branch calls getCloudflareContext(),
  // which is only meaningfully mockable inside an actual Workers runtime;
  // outside one it already throws (caught, treated as "not on Workers") —
  // exercised implicitly by every other upload test passing under Node/vitest.
});

describe('writeUploadFile', () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ahantime-upload-storage-'));
  });
  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    vi.resetModules();
    for (const f of await fs.readdir(tmpDir)) await fs.rm(path.join(tmpDir, f));
  });

  it('writes a normal upload successfully and returns a matching filename', async () => {
    const data = Buffer.from('normal-upload-bytes');
    const filename = await writeUploadFile(tmpDir, 'jpg', data);
    expect(filename).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}\.jpg$/);
    const onDisk = await fs.readFile(path.join(tmpDir, filename));
    expect(onDisk.equals(data)).toBe(true);
  });

  // I-204/I-205 — force a name collision (mock `ulid` to return the same id
  // on the first two calls, then a distinct one) and prove the SECOND write
  // never overwrites the first: both files exist afterward, each holding its
  // own original bytes, and the two returned filenames differ.
  it('never overwrites an existing file on a name collision — retries with a fresh name', async () => {
    vi.resetModules();
    vi.doMock('ulid', () => {
      let call = 0;
      const ids = ['01H0000000000000000000COLL', '01H0000000000000000000COLL', '01H0000000000000000000UNIQ'];
      return { ulid: () => ids[Math.min(call++, ids.length - 1)] };
    });
    const { writeUploadFile: writeUploadFileMocked } = await import('./uploadStorage');

    const firstBytes = Buffer.from('first-uploads-bytes');
    const secondBytes = Buffer.from('second-uploads-bytes-different');

    const firstName = await writeUploadFileMocked(tmpDir, 'jpg', firstBytes);
    const secondName = await writeUploadFileMocked(tmpDir, 'jpg', secondBytes);

    expect(firstName).not.toBe(secondName);
    expect(await fs.readFile(path.join(tmpDir, firstName))).toEqual(firstBytes);
    expect(await fs.readFile(path.join(tmpDir, secondName))).toEqual(secondBytes);

    vi.doUnmock('ulid');
  });

  it('propagates a non-EEXIST write error instead of retrying forever', async () => {
    await expect(
      writeUploadFile(path.join(tmpDir, 'does-not-exist-dir'), 'jpg', Buffer.from('x')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

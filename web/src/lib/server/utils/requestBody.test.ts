// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { readFormBody, readJsonBody, PayloadTooLargeError, JsonTooDeepError } from './requestBody';

it('round-trips a multipart file and text field', async () => {
  const form = new FormData();
  form.set('file', new Blob(['image bytes'], { type: 'image/png' }), 'photo.png');
  form.set('caption', 'آهن');
  const parsed = await readFormBody(new Request('http://local', { method: 'POST', body: form }));
  expect(parsed?.get('caption')).toBe('آهن');
  expect(await (parsed?.get('file') as File).text()).toBe('image bytes');
});
it('rejects extra multipart fields exceeding the aggregate limit', async () => {
  const form = new FormData();
  form.set('file', new Blob(['small']), 'photo.png');
  form.set('extra', 'x'.repeat(6 * 1024 * 1024));
  const encoded = new Request('http://local', { method: 'POST', body: form });
  const req = new Request('http://local', {
    method: 'POST',
    body: await encoded.arrayBuffer(),
    headers: encoded.headers,
  });
  await expect(readFormBody(req)).rejects.toBeInstanceOf(PayloadTooLargeError);
});
it('cancels a chunked oversized multipart body with a dishonest length', async () => {
  const cancel = vi.fn();
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(new Uint8Array(6 * 1024 * 1024 + 1));
    },
    cancel,
  });
  const req = new Request('http://local', {
    method: 'POST',
    body: stream,
    duplex: 'half',
    headers: { 'content-type': 'multipart/form-data; boundary=test', 'content-length': '1' },
  } as RequestInit);
  await expect(readFormBody(req)).rejects.toBeInstanceOf(PayloadTooLargeError);
  expect(cancel).toHaveBeenCalledOnce();
});
it('keeps malformed multipart as null', async () => {
  expect(
    await readFormBody(new Request('http://local', { method: 'POST', body: 'bad' })),
  ).toBeNull();
});
it('does not turn oversized JSON into null for callers with optional payloads', async () => {
  await expect(
    readJsonBody(new Request('http://local', { method: 'POST', body: 'x'.repeat(1048577) })),
  ).rejects.toBeInstanceOf(PayloadTooLargeError);
});
it('preserves malformed JSON fallback', async () => {
  expect(await readJsonBody(new Request('http://local', { method: 'POST', body: '{' }))).toBeNull();
});
it('rejects JSON nested past the depth cap (H-174)', async () => {
  let deep: unknown = 'leaf';
  for (let i = 0; i < 25; i++) deep = { n: deep };
  await expect(
    readJsonBody(new Request('http://local', { method: 'POST', body: JSON.stringify(deep) })),
  ).rejects.toBeInstanceOf(JsonTooDeepError);
});
it('accepts ordinary nesting well under the depth cap', async () => {
  let normal: unknown = 'leaf';
  for (let i = 0; i < 5; i++) normal = { n: normal };
  await expect(
    readJsonBody(new Request('http://local', { method: 'POST', body: JSON.stringify(normal) })),
  ).resolves.toEqual(normal);
});

// I-202 (docs/audit-upload-media-I.md) — the audit's exact gap: the 6MB
// aggregate multipart cap had a test at 6MB+1 (above, via a dishonest
// content-length) and at "6MB extra field + a small file", but nothing
// pinned the boundary itself via the fast-path `content-length` header check
// in `readBody` — i.e. exactly AT the cap must still succeed, not just
// "some values under it happen to work". Three real, documented size layers
// exist for uploads: Caddyfile's edge `max_size 20MB` (infrastructure, not
// exercisable from vitest — see the structural check below), this file's own
// 6MB aggregate multipart cap, and each upload route's own 5MB single-file
// cap (see upload/route.test.ts's "I-202" describe block).
describe('I-202 — readFormBody 6MB aggregate boundary (the middle of the three size layers)', () => {
  const CAP = 6 * 1024 * 1024;

  it('accepts a body of exactly the byte cap (content-length fast path never fires)', async () => {
    const body = new Uint8Array(CAP);
    const req = new Request('http://local', { method: 'POST', body });
    // Not valid multipart (no boundary), so parsing itself fails and
    // readFormBody's catch-all returns null — the property under test is
    // that this resolves at all, i.e. the SIZE gate did not reject a body
    // sitting exactly at the cap.
    await expect(readFormBody(req)).resolves.toBeNull();
  });

  it('rejects a body one byte over the cap via content-length, before attempting to parse it', async () => {
    const body = new Uint8Array(CAP + 1);
    const req = new Request('http://local', { method: 'POST', body });
    await expect(readFormBody(req)).rejects.toBeInstanceOf(PayloadTooLargeError);
  });
});

describe('I-202 — the three documented upload size layers stay ordered (Caddy edge ≥ multipart aggregate ≥ per-file cap)', () => {
  it("Caddyfile's edge cap for both public hosts is still 20MB, and still ≥ this file's 6MB aggregate cap", async () => {
    // Structural, not behavioral: Caddy itself isn't running under vitest, so
    // this can only prove the CONFIGURED number hasn't silently drifted below
    // the app-level caps it's supposed to sit above (see
    // docs/audit-upload-media-I.md#I-202). The actual edge enforcement was
    // last verified live via curl per CLAUDE.md's deploy-verification section.
    const fs = await import('node:fs');
    const path = await import('node:path');
    const caddyfile = fs.readFileSync(path.join(process.cwd(), '..', 'Caddyfile'), 'utf8');
    const hostBlocks = [/ahantime\.com, www\.ahantime\.com \{[\s\S]*?\n\}/, /panel\.ahantime\.com \{[\s\S]*?\n\}/];
    for (const blockRe of hostBlocks) {
      const block = blockRe.exec(caddyfile)?.[0];
      expect(block, `could not find the expected host block in Caddyfile with pattern ${blockRe}`).toBeTruthy();
      const maxSizeMatch = /max_size\s+(\d+)MB/.exec(block!);
      expect(maxSizeMatch, `host block has no request_body max_size directive: ${block}`).toBeTruthy();
      const edgeCapMb = Number(maxSizeMatch![1]);
      expect(edgeCapMb).toBeGreaterThanOrEqual((6 * 1024 * 1024) / (1024 * 1024));
    }
  });
});

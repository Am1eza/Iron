// @vitest-environment node
import { expect, it, vi } from 'vitest';
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

// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { z } from 'zod';
import { validateBody } from './request';
const schema = z.object({ text: z.string() });
function streamed(chunks: Uint8Array[], headers?: Record<string, string>) {
  const cancel = vi.fn();
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(c) {
      if (index < chunks.length) c.enqueue(chunks[index++]!);
      else c.close();
    },
    cancel,
  });
  return {
    cancel,
    req: new Request('https://example.test/api', {
      method: 'POST',
      body,
      headers,
      duplex: 'half',
    } as RequestInit),
  };
}
it('preserves Persian characters split across byte chunks', async () => {
  const bytes = new TextEncoder().encode(JSON.stringify({ text: 'آهن' }));
  const { req } = streamed(Array.from(bytes, (b) => Uint8Array.of(b)));
  expect(await validateBody(req, schema)).toEqual({ ok: true, data: { text: 'آهن' } });
});
it.each([undefined, { 'content-length': '1' }])(
  'bounds actual bytes despite absent or false length %j',
  async (headers) => {
    const { req, cancel } = streamed([new Uint8Array(1048577), Uint8Array.of(1)], headers);
    const result = await validateBody(req, schema);
    if (result.ok) throw new Error('Expected rejection');
    expect(result.response.status).toBe(413);
    expect(cancel).toHaveBeenCalledOnce();
  },
);
it('rejects declared oversized bodies without reading them', async () => {
  const { req, cancel } = streamed([Uint8Array.of(1)], { 'content-length': '1048577' });
  const result = await validateBody(req, schema);
  if (result.ok) throw new Error('Expected rejection');
  expect(result.response.status).toBe(413);
  expect(cancel).toHaveBeenCalledOnce();
});
it('accepts exactly the maximum byte size', async () => {
  const body = JSON.stringify({ text: 'a'.repeat(1048576 - 11) });
  expect(new TextEncoder().encode(body).length).toBe(1048576);
  expect(
    (await validateBody(new Request('https://example.test', { method: 'POST', body }), schema)).ok,
  ).toBe(true);
});
it.each(['{', '{"text":12}'])('retains validation errors for %s', async (body) => {
  const result = await validateBody(
    new Request('https://example.test', { method: 'POST', body }),
    schema,
  );
  if (result.ok) throw new Error('Expected rejection');
  expect(result.response.status).toBe(400);
});
it('rejects a JSON body nested past the depth cap (H-174)', async () => {
  let deep: unknown = 'leaf';
  for (let i = 0; i < 25; i++) deep = { n: deep };
  const result = await validateBody(
    new Request('https://example.test', { method: 'POST', body: JSON.stringify(deep) }),
    schema,
  );
  if (result.ok) throw new Error('Expected rejection');
  expect(result.response.status).toBe(400);
});

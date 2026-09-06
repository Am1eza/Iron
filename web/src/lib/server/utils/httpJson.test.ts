// @vitest-environment node
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fetchJson, UpstreamHttpError } from './httpJson';

let server: Server;
let origin: string;
beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/truncated') {
      res.writeHead(200, { 'content-length': '100' });
      res.write('{');
      setImmediate(() => res.destroy());
    } else if (req.url === '/unavailable') {
      res.writeHead(503).end('Unavailable');
    } else if (req.url === '/invalid') {
      res.end('invalid JSON');
    } else {
      res.end(JSON.stringify({ ok: true }));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

describe('fetchJson response handling', () => {
  it('reads a complete JSON response', async () => {
    await expect(fetchJson(origin)).resolves.toEqual({ ok: true });
  });
  it('rejects a connection lost after headers instead of hanging or emitting an unhandled error', async () => {
    await expect(fetchJson(`${origin}/truncated`)).rejects.toMatchObject({ code: 'ECONNRESET' });
  });
  it('preserves upstream HTTP status', async () => {
    await expect(fetchJson(`${origin}/unavailable`)).rejects.toBeInstanceOf(UpstreamHttpError);
  });
  it('rejects malformed JSON', async () => {
    await expect(fetchJson(`${origin}/invalid`)).rejects.toBeInstanceOf(SyntaxError);
  });
});

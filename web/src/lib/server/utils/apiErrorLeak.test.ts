// @vitest-environment node
/**
 * H-190 — the audit reasoned about this from the code and said so plainly:
 * «یک تست end-to-end واقعی («یک اتصال DB را عمداً قطع کن، یک درخواست بزن،
 * تأیید کن پاسخ فقط پیام عمومی دارد») در این نوبت اجرا نشد».
 *
 * This runs it. A database failure is made to happen for real inside a real
 * route handler, and the response is inspected for every way a driver error
 * leaks: the SQL text, the connection string, the host and port, the driver's
 * own message, and the stack.
 *
 * The failure is injected at the repo layer rather than by mocking
 * `withApiErrorHandling` itself — mocking the thing under test would prove
 * only that the mock works.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type * as DbClient from '@/lib/server/db/client';

vi.mock('@/lib/server/utils/rateLimit', () => ({ rateLimit: async () => null }));
vi.mock('@/lib/server/db/client', async (importOriginal) => ({
  ...(await importOriginal<typeof DbClient>()),
  hasDb: () => true,
}));

// `vi.mock` factories are hoisted above every const in this file, so the
// spies have to live on a hoisted object rather than in module scope.
const mocks = vi.hoisted(() => ({ searchSkus: vi.fn(), reportError: vi.fn() }));
const { searchSkus, reportError } = mocks;
vi.mock('@/lib/server/repos/catalogRepo', () => ({ searchSkus: mocks.searchSkus }));
vi.mock('@/lib/server/repos/articlesRepo', () => ({ searchArticles: async () => [] }));

// The error tracker is where this detail SHOULD go — asserted below.
vi.mock('@/lib/errors/report', () => ({ reportError: mocks.reportError }));

import { GET } from '@/app/api/search/route';

/** What `pg` actually throws when the database is unreachable or the query
 *  fails — message, SQL text, host/port and a stack, all on one object. */
function realisticDriverError(): Error {
  const err = new Error(
    'connect ECONNREFUSED 10.0.0.5:5432 — select "skus"."id", "skus"."slug" from "skus" where "skus"."name" ilike $1',
  );
  Object.assign(err, {
    code: 'ECONNREFUSED',
    address: '10.0.0.5',
    port: 5432,
    severity: 'FATAL',
    routine: 'auth_failed',
    query: 'select "skus"."id" from "skus" where "skus"."name" ilike $1',
  });
  return err;
}

beforeEach(() => {
  searchSkus.mockReset();
  reportError.mockReset();
});

describe('H-190 — a database failure never reaches the client as detail', () => {
  it('answers 500 with ONLY the generic Persian message', async () => {
    searchSkus.mockRejectedValue(realisticDriverError());
    const res = await GET(new NextRequest('http://localhost/api/search?q=میلگرد'));

    expect(res.status).toBe(500);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({
      error: 'internal_error',
      message: 'خطایی در سرور رخ داد. دوباره تلاش کنید.',
    });
  });

  it('leaks no SQL, host, port, driver code or stack in the response body', async () => {
    searchSkus.mockRejectedValue(realisticDriverError());
    const res = await GET(new NextRequest('http://localhost/api/search?q=میلگرد'));
    const text = await res.text();

    for (const secret of [
      'ECONNREFUSED',
      '10.0.0.5',
      '5432',
      'select "skus"',
      'ilike',
      'FATAL',
      'auth_failed',
      '.ts:',
      'at Object.',
      'node_modules',
    ]) {
      expect(text, `response leaked ${secret}`).not.toContain(secret);
    }
  });

  it('still reports the full detail to the error tracker — the detail is hidden, not lost', async () => {
    // A 500 that told nobody anything would be a different bug: the operator
    // has to be able to diagnose exactly what the customer could not see.
    searchSkus.mockRejectedValue(realisticDriverError());
    await GET(new NextRequest('http://localhost/api/search?q=میلگرد'));

    expect(reportError).toHaveBeenCalledTimes(1);
    const [err] = reportError.mock.calls[0]!;
    expect((err as Error).message).toContain('ECONNREFUSED');
  });

  it('does the same for a non-Error thrown value', async () => {
    // A driver or a badly-written helper can reject with a bare string; the
    // handler must not end up interpolating it into the response.
    searchSkus.mockRejectedValue('password=hunter2 host=10.0.0.5');
    const res = await GET(new NextRequest('http://localhost/api/search?q=میلگرد'));

    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain('hunter2');
    expect(text).not.toContain('10.0.0.5');
  });

  it('the assertions are real — a healthy request still returns data', async () => {
    searchSkus.mockResolvedValue([{ id: 's1', name: 'میلگرد ۱۴' }]);
    const res = await GET(new NextRequest('http://localhost/api/search?q=میلگرد'));
    expect(res.status).toBe(200);
    expect((await res.json()).skus).toHaveLength(1);
    expect(reportError).not.toHaveBeenCalled();
  });
});

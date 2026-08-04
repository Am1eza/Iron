import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { rateLimit } from '@/lib/server/utils/rateLimit';
import { BUDGETS, isWithinBudget } from '@/lib/perf/webVitals';

/**
 * POST /api/vitals — the Web Vitals sink.
 *
 * This route existed but never read the request body: it returned 204 and
 * dropped the payload. Every visitor's LCP/CLS/INP/FCP/TTFB was measured, put
 * on the wire, and thrown away — so the budgets CLAUDE.md defines as the
 * definition of done (LCP < 2.5s · TTFB < 0.8s · CLS < 0.1) had never actually
 * been measured against real Iranian connections, only against a local
 * Lighthouse run. A silent endpoint is not evidence of a fast site.
 *
 * It now writes one JSON line per sample to stdout — the same convention
 * `lib/errors/report.ts` uses, so Docker's json-file driver and any real
 * aggregator can query it with no extra sink — tagged `ahantime:vitals` and
 * flagged `overBudget` when the sample breaches its budget. Deliberately NOT a
 * new database table: a beacon fires ~5× per page load from every visitor, and
 * a write-heavy table nobody reads is a worse answer than a log line.
 *
 * Unauthenticated by necessity (the beacon fires for logged-out visitors, and
 * often during page teardown), which is why it is deliberately narrow — the
 * same shape as /api/log (c913606):
 *  - rate limited per IP, so it cannot be used to flood the log volume;
 *  - a strict schema with short caps and a closed metric-name set, so it
 *    cannot be used as free storage;
 *  - `section` is the FIRST path segment only, never the full pathname —
 *    enough to attribute a breach to «قیمت‌ها» or «پیش‌فاکتور», while
 *    /proforma/<ref> and /track/<ref> can never write a lookup token into the
 *    logs. There is no other identifier in the payload.
 * It always answers 204, whatever happens: telemetry must never hand a page a
 * second problem.
 *
 * Note: no `export const runtime = 'edge'` — the OpenNext/Cloudflare adapter runs
 * the default runtime on workerd (nodejs_compat), and edge routes would need to be
 * bundled separately.
 */
export const runtime = 'nodejs';

const payload = z.object({
  // Closed set: an unknown name has no budget to compare against and would
  // only be an unbounded label in the logs.
  name: z.enum(['LCP', 'CLS', 'INP', 'FCP', 'TTFB']),
  // CLS is unitless and small; the others are milliseconds. 600_000 (10 min)
  // is far past any real sample and still bounds a hostile one.
  value: z.number().finite().nonnegative().max(600_000),
  rating: z.enum(['good', 'needs-improvement', 'poor']).optional(),
  // First path segment only — see the note above. ASCII, since every URL
  // segment in this app is ASCII by design (see CLAUDE.md §3).
  section: z
    .string()
    .trim()
    .max(40)
    .regex(/^[a-z0-9-]*$/)
    .optional(),
});

async function POSTImpl(req: NextRequest): Promise<NextResponse> {
  const limited = await rateLimit(req, 'vitals', { limit: 120, windowMs: 60_000 });
  // rateLimit returns a 429 response; a beacon has nobody to show it to, so
  // drop the sample and still answer 204.
  if (limited) return new NextResponse(null, { status: 204 });

  try {
    const parsed = payload.safeParse(await req.json());
    if (parsed.success) {
      const { name, value, rating, section } = parsed.data;
      const overBudget = !isWithinBudget({ id: '', name, value, rating });
      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify({
          level: overBudget ? 'warn' : 'info',
          tag: 'ahantime:vitals',
          name,
          // Sub-millisecond precision is noise for every metric except CLS,
          // which is a small unitless number and needs three decimals.
          value: name === 'CLS' ? Math.round(value * 1000) / 1000 : Math.round(value),
          rating,
          budget: BUDGETS[name],
          overBudget,
          section: section || 'home',
          at: new Date().toISOString(),
        }),
      );
    }
  } catch {
    // Malformed body, unreadable stream, anything: swallow. Losing one sample
    // is strictly better than a telemetry endpoint that can 500.
  }
  return new NextResponse(null, { status: 204 });
}

export const POST = withApiErrorHandling(POSTImpl);

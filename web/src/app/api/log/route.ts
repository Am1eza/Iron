import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { rateLimit } from '@/lib/server/utils/rateLimit';
import { reportError } from '@/lib/errors/report';

/**
 * POST /api/log — the client-side error sink.
 *
 * Until this existed, reportError() on the client wrote to `console.error` and
 * stopped there: every browser-side failure — hydration crashes, a bundle that
 * throws only on Safari, a fetch that fails only from an Iranian ISP — was
 * discarded. The server half of the app had error tracking; the half the
 * customer actually runs had none, and GlitchTip's silence on client errors
 * was not evidence of health.
 *
 * Unauthenticated by necessity (a login page that white-screens must still be
 * able to report), which is why it is deliberately narrow:
 *  - rate limited per IP, so it cannot be used to flood the error tracker or
 *    the log volume;
 *  - a strict schema with short caps, so it cannot be used as free storage;
 *  - the body is treated as untrusted text and goes through the same
 *    redact/scrub path as any server error before it is logged or forwarded.
 * It always answers 204: a reporting endpoint must never give a failing page a
 * second error to handle.
 */
export const runtime = 'nodejs';

const payload = z.object({
  name: z.string().trim().max(120).optional(),
  message: z.string().trim().max(1000),
  stack: z.string().trim().max(4000).optional(),
  url: z.string().trim().max(500).optional(),
  userAgent: z.string().trim().max(300).optional(),
});

async function POSTImpl(req: NextRequest): Promise<NextResponse> {
  const limited = await rateLimit(req, 'client-log', { limit: 20, windowMs: 60_000 });
  if (limited) return new NextResponse(null, { status: 204 });

  try {
    const parsed = payload.safeParse(await req.json());
    if (parsed.success) {
      const { name, message, stack, url, userAgent } = parsed.data;
      // Reconstructed as an Error so it takes the identical redact + scrub +
      // Sentry path as a server-side report rather than a second, parallel one.
      const err = new Error(message);
      err.name = name ?? 'ClientError';
      err.stack = stack;
      reportError(err, { source: 'client', url, userAgent });
    }
  } catch {
    // Malformed body, unreadable stream, anything: swallow. The caller is a
    // page that is already broken.
  }
  return new NextResponse(null, { status: 204 });
}

export const POST = withApiErrorHandling(POSTImpl);

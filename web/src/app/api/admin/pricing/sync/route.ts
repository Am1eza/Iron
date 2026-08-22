import { NextResponse, type NextRequest, after } from 'next/server';
import { z } from 'zod';
import { validateBody } from '@/lib/validation/request';
import { requireApiPermission, requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import {
  listSyncEntries,
  listSyncRuns,
  syncRunBreakdown,
} from '@/lib/server/repos/priceSyncRepo';
import { priceSyncScope, runPriceSync } from '@/lib/server/services/priceSync.service';
import { getPriceSyncConfig } from '@/lib/server/repos/settingsRepo';
import { safeRevalidatePath } from '@/lib/server/utils/revalidate';
import { reportError } from '@/lib/errors/report';

/**
 * GET /api/admin/pricing/sync — the automated mirror's audit trail.
 *
 * `entries` is keyset-paginated newest-first; `runs` is the last 20 passes so
 * the page can show "when did this last run and what did it do".
 */
async function GETImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'pricing:write');
  if ('response' in auth) return auth.response;

  const sp = req.nextUrl.searchParams;
  const outcomeParam = sp.get('outcome');
  const outcome = outcomeParam === 'written' || outcomeParam === 'skipped' ? outcomeParam : undefined;

  const [{ entries, nextCursor }, runs, config, scope] = await Promise.all([
    listSyncEntries({
      runId: sp.get('run') ?? undefined,
      outcome,
      categorySlug: sp.get('cat') ?? undefined,
      cursor: sp.get('cursor') ?? undefined,
      limit: 50,
    }),
    listSyncRuns(20),
    getPriceSyncConfig(),
    priceSyncScope(),
  ]);

  const latest = runs[0];
  const breakdown = latest ? await syncRunBreakdown(latest.id) : [];

  return NextResponse.json(
    { entries, nextCursor, runs, config, scope, breakdown },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

const triggerPayload = z.object({
  /** Present only so the body is a well-formed object; the run is always a
   *  forced manual one — an admin pressing the button IS the authorization. */
  confirm: z.literal(true),
});

/**
 * POST /api/admin/pricing/sync — run the mirror now.
 *
 * Answers 202, not 200: a full pass fetches ~30 competitor pages 3.5s apart
 * and takes minutes, far past any sane HTTP timeout. The work runs under
 * `after()` (the same reason the bulk-save route uses it — on the Workers
 * target a bare floating promise can be torn down with the response) and the
 * client polls GET for the finished run. `runPriceSync` itself refuses to
 * start a second concurrent pass, so a double-click is harmless.
 */
async function POSTImpl(req: NextRequest) {
  const guard = requireDb();
  if (guard) return guard;
  const auth = await requireApiPermission(req, 'pricing:write');
  if ('response' in auth) return auth.response;
  const v = await validateBody(req, triggerPayload);
  if (!v.ok) return v.response;

  after(() =>
    runPriceSync({ trigger: 'manual', force: true })
      .then((s) => {
        if (s.status === 'failed') {
          reportError(new Error(s.error ?? 'price sync failed'), { scope: 'priceSync.manual' });
          return;
        }
        // The cache bust lives HERE rather than in the service: this is the one
        // caller that runs inside a Next.js request, so `revalidatePath` has a
        // rendering context to act on. The cron script does not, which is why
        // the service deliberately never calls it (see its comment). Home reads
        // the same rows as /prices but sits outside that subtree, so it needs
        // its own bust — same pair the admin bulk-save route purges.
        if (s.written > 0) {
          safeRevalidatePath('/prices', 'layout');
          safeRevalidatePath('/', 'page');
        }
      })
      .catch((err) => reportError(err, { scope: 'priceSync.manual' })),
  );

  return NextResponse.json({ started: true }, { status: 202 });
}

export const GET = withApiErrorHandling(GETImpl);
export const POST = withApiErrorHandling(POSTImpl);

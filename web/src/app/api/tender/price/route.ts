import { NextResponse, type NextRequest } from 'next/server';
import { validateBody } from '@/lib/validation/request';
import { tenderPricePayload } from '@/lib/validation/api';
import { assertSameOrigin } from '@/lib/auth/origin';
import { requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { priceTender } from '@/lib/server/services/tenderEstimate';
import { rateLimit } from '@/lib/server/utils/rateLimit';
import { reportError } from '@/lib/errors/report';

/**
 * POST /api/tender/price — read-only live pricing for the برآورد مناقصات tool.
 * Creates NOTHING: it re-prices a set of rows on every edit so the running
 * total the user sees is the same authoritative figure `priceItems` produces,
 * to the ریال, when they later submit through /api/leads. Same-origin + a
 * dedicated `tender` rate bucket (more generous than `leads`, since a person
 * editing a multi-row form re-prices far more often than they submit — and it
 * must not eat into their actual submit budget) guard it against being used as
 * a bulk price scraper.
 */
async function POSTImpl(req: NextRequest) {
  const origin = assertSameOrigin(req);
  if (origin) return origin;
  const limited = await rateLimit(req, 'tender', { limit: 60 });
  if (limited) return limited;
  const guard = requireDb();
  if (guard) return guard;

  const v = await validateBody(req, tenderPricePayload);
  if (!v.ok) return v.response;

  try {
    const quote = await priceTender(v.data.items);
    return NextResponse.json(quote);
  } catch (err) {
    reportError(err, { route: 'tender/price' });
    return NextResponse.json(
      { error: 'tender_price_failed', message: 'محاسبهٔ برآورد ناموفق بود. دوباره تلاش کنید.' },
      { status: 500 },
    );
  }
}

export const POST = withApiErrorHandling(POSTImpl);

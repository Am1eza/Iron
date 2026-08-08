import { NextResponse, type NextRequest } from 'next/server';
import { assertSameOrigin } from '@/lib/auth/origin';
import { requireDb, withApiErrorHandling } from '@/lib/server/utils/apiGuard';
import { factoryOptionsFor, sizesFor } from '@/lib/server/services/tenderEstimate';
import { rateLimit } from '@/lib/server/utils/rateLimit';
import { reportError } from '@/lib/errors/report';

/**
 * GET /api/tender/options?category=&sub=[&size=] — the per-row option feed for
 * the برآورد مناقصات form. Categories → products (sub-categories) are handed to
 * the page as initial server data; this endpoint answers the two later steps a
 * row needs on demand: the sizes under a product, and the factory choices (each
 * a concrete SKU + its live price, cheapest first) for a given size. Pricing is
 * resolved server-side here so the client never quotes from a stale snapshot.
 */
async function GETImpl(req: NextRequest) {
  const origin = assertSameOrigin(req);
  if (origin) return origin;
  const limited = await rateLimit(req, 'tender', { limit: 60 });
  if (limited) return limited;
  const guard = requireDb();
  if (guard) return guard;

  const { searchParams } = new URL(req.url);
  const category = (searchParams.get('category') ?? '').trim();
  const sub = (searchParams.get('sub') ?? '').trim();
  const size = (searchParams.get('size') ?? '').trim() || undefined;
  if (!category || !sub) {
    return NextResponse.json({ error: 'bad_request', message: 'دسته و محصول لازم است.' }, { status: 400 });
  }

  try {
    const [sizes, factories] = await Promise.all([
      sizesFor(category, sub),
      factoryOptionsFor(category, sub, size),
    ]);
    return NextResponse.json({ sizes, factories });
  } catch (err) {
    reportError(err, { route: 'tender/options' });
    return NextResponse.json(
      { error: 'tender_options_failed', message: 'دریافت گزینه‌ها ناموفق بود.' },
      { status: 500 },
    );
  }
}

export const GET = withApiErrorHandling(GETImpl);
